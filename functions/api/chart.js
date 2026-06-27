export async function onRequestPost(context) {
  let payload;

  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const validationError = validatePayload(payload);

  if (validationError) {
    return json({ error: validationError }, 422);
  }

  const chartCache = getChartCacheStore(context.env);
  const cacheKey = chartCache ? createChartCacheKey(payload) : null;
  let ephemerisChart = null;
  let cached = false;

  if (chartCache && cacheKey) {
    const cachedValue = await chartCache.get(cacheKey);

    if (cachedValue) {
      try {
        ephemerisChart = JSON.parse(cachedValue);
        cached = true;
      } catch {
        await chartCache.delete(cacheKey);
      }
    }
  }

  if (!ephemerisChart) {
    try {
      ephemerisChart = await createEphemerisChart(context.env, payload);
    } catch (error) {
      if (error instanceof ProviderError && error.status === 429) {
        return json({
          ok: false,
          error: "PROVIDER_RATE_LIMIT",
          message: "Chart provider limit reached. Try later or configure credits."
        }, 429);
      }

      return json({
        error: "Live-Berechnung fehlgeschlagen.",
        detail: error instanceof Error ? error.message : "Unknown chart provider error."
      }, 502);
    }
  }

  if (ephemerisChart) {
    const publicChart = payload.savePublic === false || payload.public === false
      ? {
        saved: false,
        storageEnabled: Boolean(getPublicChartStore(context.env)),
        skipped: true,
        entry: createPublicChartEntry(ephemerisChart, payload)
      }
      : await savePublicChart(context.env, ephemerisChart, payload);

    if (chartCache && cacheKey && !cached) {
      await chartCache.put(cacheKey, JSON.stringify(ephemerisChart));
    }

    return json({ ...ephemerisChart, publicChart, cached });
  }

  return json({
    error: "Swiss Ephemeris API ist nicht konfiguriert.",
    detail: "ASTROLOGY_API_KEY fehlt im Cloudflare Worker. Ohne Live-Key wird kein erfundenes Human-Design-Ergebnis erzeugt."
  }, 503);
}

export async function onRequestGet(context) {
  const charts = await listPublicCharts(context.env);

  return json({
    charts,
    storageEnabled: Boolean(getPublicChartStore(context.env))
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

const PUBLIC_CHART_INDEX_KEY = "public-charts:v2:index";
const PUBLIC_CHART_PREFIX = "public-chart:v2:";
const PUBLIC_CHART_LIMIT = 60;

async function savePublicChart(env, chart, payload) {
  const store = getPublicChartStore(env);
  const entry = createPublicChartEntry(chart, payload);

  if (!store) {
    return { saved: false, storageEnabled: false, entry };
  }

  await store.put(`${PUBLIC_CHART_PREFIX}${entry.id}`, JSON.stringify(entry));

  const ids = await readPublicChartIndex(store);
  const nextIds = [entry.id, ...ids.filter((id) => id !== entry.id)].slice(0, PUBLIC_CHART_LIMIT);
  await store.put(PUBLIC_CHART_INDEX_KEY, JSON.stringify(nextIds));

  return { saved: true, storageEnabled: true, entry };
}

async function listPublicCharts(env) {
  const store = getPublicChartStore(env);

  if (!store) {
    return [];
  }

  const ids = await readPublicChartIndex(store);
  const entries = await Promise.all(
    ids.slice(0, PUBLIC_CHART_LIMIT).map(async (id) => {
      const value = await store.get(`${PUBLIC_CHART_PREFIX}${id}`);

      if (!value) {
        return null;
      }

      try {
        return sanitizePublicChartEntry(JSON.parse(value));
      } catch {
        return null;
      }
    })
  );

  return entries.filter(Boolean);
}

async function readPublicChartIndex(store) {
  try {
    const value = await store.get(PUBLIC_CHART_INDEX_KEY);
    const ids = JSON.parse(value || "[]");

    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function getPublicChartStore(env) {
  return env?.PUBLIC_CHARTS || env?.MYHUMANOS_CHARTS || null;
}

function getChartCacheStore(env) {
  return env?.MYHUMANOS_CACHE || null;
}

function createChartCacheKey(payload) {
  const normalized = normalizeChartCachePayload(payload);
  return `chart-cache:v3:${hash(JSON.stringify(normalized)).toString(16)}`;
}

function normalizeChartCachePayload(payload) {
  return {
    birthDate: String(payload?.birthDate || "").trim(),
    birthPlace: String(payload?.birthPlace || "").trim().replace(/\s+/g, " "),
    birthTime: String(payload?.birthTime || "").trim(),
    includeTransits: normalizeCacheBool(payload?.includeTransits),
    latitude: normalizeCacheCoordinate(payload?.latitude ?? payload?.lat),
    longitude: normalizeCacheCoordinate(payload?.longitude ?? payload?.lng ?? payload?.lon),
    houseSystem: String(payload?.houseSystem || "P").trim(),
    zodiacType: String(payload?.zodiacType || "Tropic").trim(),
    timezone: String(payload?.timezone || "").trim()
  };
}

function normalizeCacheBool(value) {
  return value === true || value === "true" || value === "on";
}

function normalizeCacheCoordinate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function createPublicChartEntry(chart, payload) {
  const hd = chart.humanDesign || {};
  const firstName = firstNameOnly(payload.name);
  const gates = sanitizePublicGates(hd.gates || chart.gates || [], 24);

  return sanitizePublicChartEntry({
    id: createPublicChartId(payload, chart),
    createdAt: new Date().toISOString(),
    firstName,
    type: chart.type || "Human Design",
    strategy: chart.strategy || "",
    authority: chart.authority || "",
    profile: chart.profile || "",
    signature: chart.signature || "",
    notSelf: chart.notSelf || "",
    centers: (hd.definedCenters || chart.centers || []).slice(0, 9),
    openCenters: (hd.openCenters || []).slice(0, 9),
    gates,
    channels: sanitizePublicChannels(hd.channels || [], 16),
    profileLines: sanitizePublicProfileLines(hd.profileLines || {}),
    incarnationCross: sanitizePublicIncarnationCross(hd.incarnationCross || {}),
    transits: sanitizePublicTransits(chart.transits || {}),
    reading: {
      summary: chart.summary || hd.summary || "",
      typeDescription: hd.typeDescription || "",
      strategyDescription: hd.strategyDescription || "",
      authorityDescription: hd.authorityDescription || "",
      profileDescription: hd.profileLines?.description || ""
    },
    provider: chart.provider || (chart.isMock ? "Preview" : "Swiss Ephemeris"),
    isMock: Boolean(chart.isMock)
  });
}

function sanitizePublicGates(gates, limit) {
  return Array.isArray(gates)
    ? gates.slice(0, limit).map((gate) => {
      if (typeof gate === "number") {
        return { gate, line: null, tone: "", planet: "", layer: "" };
      }

      return {
        gate: Number(gate.gate),
        line: Number.isFinite(Number(gate.line)) ? Number(gate.line) : null,
        tone: cleanPublicText(gate.tone, 64),
        planet: cleanPublicText(gate.planet, 32),
        layer: cleanPublicText(gate.layer, 24)
      };
    }).filter((gate) => Number.isFinite(gate.gate))
    : [];
}

function sanitizePublicChannels(channels, limit) {
  return Array.isArray(channels)
    ? channels.slice(0, limit).map((channel) => ({
      name: cleanPublicText(channel.name || `${channel.gateA}-${channel.gateB}`, 24),
      gateA: Number(channel.gateA),
      gateB: Number(channel.gateB),
      from: cleanPublicText(channel.from, 32),
      to: cleanPublicText(channel.to, 32)
    })).filter((channel) => Number.isFinite(channel.gateA) && Number.isFinite(channel.gateB))
    : [];
}

function sanitizePublicProfileLines(profileLines) {
  const source = profileLines?.source || {};

  return {
    personality: cleanPublicText(profileLines?.personality, 100),
    design: cleanPublicText(profileLines?.design, 100),
    description: cleanPublicText(profileLines?.description, 220),
    source: {
      personalitySun: sanitizePublicActivationSource(source.personalitySun),
      designSun: sanitizePublicActivationSource(source.designSun)
    }
  };
}

function sanitizePublicActivationSource(source) {
  if (!source) {
    return null;
  }

  return {
    gate: Number(source.gate),
    line: Number.isFinite(Number(source.line)) ? Number(source.line) : null,
    tone: cleanPublicText(source.tone, 64),
    sign: cleanPublicText(source.sign, 24)
  };
}

function sanitizePublicIncarnationCross(cross) {
  return {
    title: cleanPublicText(cross?.title, 120),
    description: cleanPublicText(cross?.description, 240),
    gates: Array.isArray(cross?.gates)
      ? cross.gates.slice(0, 4).map((item) => ({
        label: cleanPublicText(item.label, 40),
        gate: Number(item.gate),
        line: Number.isFinite(Number(item.line)) ? Number(item.line) : null,
        tone: cleanPublicText(item.tone, 64)
      })).filter((item) => Number.isFinite(item.gate))
      : []
  };
}

function sanitizePublicTransits(transits) {
  const today = transits?.today || null;

  return {
    enabled: Boolean(transits?.enabled),
    generatedAt: isIsoLike(transits?.generatedAt) ? transits.generatedAt : null,
    summary: cleanPublicText(transits?.summary, 220),
    gates: sanitizePublicGates(transits?.gates || [], 12),
    channels: sanitizePublicChannels(transits?.channels || [], 8),
    today: today ? {
      title: cleanPublicText(today.title, 90),
      mantra: cleanPublicText(today.mantra, 220),
      transitTheme: cleanPublicText(today.transitTheme, 220),
      secondTheme: cleanPublicText(today.secondTheme, 180),
      bodyCue: cleanPublicText(today.bodyCue, 220),
      conditioning: cleanPublicText(today.conditioning, 220),
      wound: cleanPublicText(today.wound, 240),
      gift: cleanPublicText(today.gift, 220),
      channelTheme: cleanPublicText(today.channelTheme, 220),
      prompts: Array.isArray(today.prompts) ? today.prompts.map((prompt) => cleanPublicText(prompt, 140)).filter(Boolean).slice(0, 3) : []
    } : null
  };
}

function sanitizePublicChartEntry(entry) {
  const cleanLine = (line) => {
    if (line === null || line === undefined || line === "") {
      return null;
    }

    const numericLine = Number(line);

    return Number.isInteger(numericLine) && numericLine >= 1 && numericLine <= 6 ? numericLine : null;
  };

  return {
    id: String(entry.id || "").slice(0, 80),
    createdAt: isIsoLike(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
    firstName: firstNameOnly(entry.firstName),
    type: cleanPublicText(entry.type, 42),
    strategy: cleanPublicText(entry.strategy, 42),
    authority: cleanPublicText(entry.authority, 42),
    profile: cleanPublicText(entry.profile, 16),
    signature: cleanPublicText(entry.signature, 42),
    notSelf: cleanPublicText(entry.notSelf, 42),
    centers: Array.isArray(entry.centers) ? entry.centers.map((center) => cleanPublicText(center, 32)).filter(Boolean).slice(0, 9) : [],
    openCenters: Array.isArray(entry.openCenters) ? entry.openCenters.map((center) => cleanPublicText(center, 32)).filter(Boolean).slice(0, 9) : [],
    gates: sanitizePublicGates(entry.gates || [], 24).map((gate) => ({ ...gate, line: cleanLine(gate.line) })),
    channels: sanitizePublicChannels(entry.channels || [], 16),
    profileLines: sanitizePublicProfileLines(entry.profileLines || {}),
    incarnationCross: sanitizePublicIncarnationCross(entry.incarnationCross || {}),
    transits: sanitizePublicTransits(entry.transits || {}),
    reading: {
      summary: cleanPublicText(entry.reading?.summary, 280),
      typeDescription: cleanPublicText(entry.reading?.typeDescription, 220),
      strategyDescription: cleanPublicText(entry.reading?.strategyDescription, 220),
      authorityDescription: cleanPublicText(entry.reading?.authorityDescription, 220),
      profileDescription: cleanPublicText(entry.reading?.profileDescription, 220)
    },
    provider: cleanPublicText(entry.provider, 32),
    isMock: Boolean(entry.isMock)
  };
}

function createPublicChartId(payload, chart) {
  const source = `${payload.name || ""}|${payload.birthDate || ""}|${payload.birthTime || ""}|${payload.birthPlace || ""}|${chart.type || ""}|${Date.now()}`;

  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `chart-${hash(source).toString(16)}-${Date.now().toString(36)}`;
}

function firstNameOnly(value) {
  const first = String(value || "Anonym")
    .trim()
    .split(/\s+/)[0]
    .replace(/[^\p{L}\p{M}0-9._-]/gu, "")
    .slice(0, 24);

  return first || "Anonym";
}

function cleanPublicText(value, maxLength) {
  return String(value || "")
    .replace(/[<>{}[\]\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isIsoLike(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Request body is required.";
  }

  if (!isDate(payload.birthDate)) {
    return "birthDate must use YYYY-MM-DD.";
  }

  if (!isTime(payload.birthTime)) {
    return "birthTime must use HH:MM.";
  }

  if (!payload.birthPlace || String(payload.birthPlace).trim().length < 2) {
    return "birthPlace is required.";
  }

  return "";
}

function createMockChart(payload) {
  const seed = hash(`${payload.birthDate}|${payload.birthTime}|${payload.birthPlace}`);
  const types = ["Generator", "Manifestierender Generator", "Projektor", "Manifestor", "Reflektor"];
  const strategies = {
    Generator: "Reagieren",
    "Manifestierender Generator": "Reagieren",
    Projektor: "Einladung abwarten",
    Manifestor: "Informieren",
    Reflektor: "Mondzyklus abwarten"
  };
  const authorities = ["Sakral", "Emotional", "Milz", "Ego", "Selbst-projiziert"];
  const profiles = ["1/3", "2/4", "3/5", "4/6", "5/1", "6/2"];
  const allCenters = ["Kopf", "Ajna", "Kehle", "G-Zentrum", "Herz", "Milz", "Sakral", "Solarplexus", "Wurzel"];
  const type = pick(types, seed);
  const centers = allCenters.filter((_, index) => ((seed >> index) & 1) === 1).slice(0, 5);

  return {
    type,
    strategy: strategies[type],
    authority: pick(authorities, seed >> 2),
    profile: pick(profiles, seed >> 4),
    centers,
    gates: Array.from({ length: 6 }, (_, index) => ((seed + index * 9) % 64) + 1),
    summary: "Diese Auswertung ist eine stabile Mock-Struktur. Die echte Human-Design-Berechnung wird hier später über Geocoding, Zeitzone und Ephemeris-Logik angebunden.",
    isMock: true,
    input: {
      birthDate: payload.birthDate,
      birthTime: payload.birthTime,
      birthPlace: String(payload.birthPlace).trim()
    }
  };
}

async function createEphemerisChart(env, payload) {
  const apiKey = env?.ASTROLOGY_API_KEY || env?.EPHEMERIS_API_KEY;

  if (!apiKey) {
    return null;
  }

  const apiBaseUrl = env.ASTROLOGY_API_BASE_URL || "https://api.astrology-api.io";
  const endpoint = env.ASTROLOGY_API_ENDPOINT || env.EPHEMERIS_API_URL || "/api/v3/charts/natal";
  const location = await resolveBirthLocation(payload);
  const requestBody = createAstrologyApiPayload(payload, location, true);
  let response = await requestAstrologyChart(apiBaseUrl, endpoint, apiKey, requestBody);

  if (!response.ok && response.status !== 429 && location.source === "geocoding") {
    response = await requestAstrologyChart(apiBaseUrl, endpoint, apiKey, createAstrologyApiPayload(payload, location, false));
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ProviderError(response.status, `Astrology API failed with status ${response.status}: ${errorBody.slice(0, 240)}`);
  }

  const data = await response.json();
  const natalPoints = extractAstrologyPoints(data);
  const targetDesignSunLongitude = designSunLongitudeFromNatal(natalPoints);
  const designRefinementSteps = parseDesignRefinementSteps(env?.HUMAN_DESIGN_DESIGN_REFINEMENT_STEPS);
  let designDate = calculateDesignDate(payload, location);
  let designData = null;
  let designRequestBody = null;
  let designSunError = null;
  let designAttempts = 0;

  if (env?.HUMAN_DESIGN_DESIGN_CHART !== "false") {
    for (let attempt = 0; attempt <= designRefinementSteps; attempt += 1) {
      designRequestBody = createAstrologyApiPayloadFromDateParts(designDate.localParts, location, true, chartSubjectName(payload, "Design"));
      const designResponse = await requestAstrologyChart(apiBaseUrl, endpoint, apiKey, designRequestBody);
      designAttempts = attempt + 1;

      if (!designResponse.ok) {
        break;
      }

      designData = await designResponse.json();
      const designSun = findPoint(extractAstrologyPoints(designData), "Sun");
      designSunError = signedLongitudeDelta(targetDesignSunLongitude, designSun?.longitude);

      if (attempt >= designRefinementSteps || !Number.isFinite(designSunError) || Math.abs(designSunError) < 0.01 || Math.abs(designSunError) > 5) {
        break;
      }

      designDate = refineDesignDateBySunError(designDate, designSunError, location.timezone);
    }
  }

  let transitData = null;
  let transitRequestBody = null;

  if (env?.HUMAN_DESIGN_TRANSITS === "true" || payload.includeTransits === true || payload.includeTransits === "true" || payload.includeTransits === "on") {
    const transitDate = utcDateToLocalParts(new Date(), location.timezone);
    transitRequestBody = createAstrologyApiPayloadFromDateParts(transitDate, location, true, chartSubjectName(payload, "Transit"));
    const transitResponse = await requestAstrologyChart(apiBaseUrl, endpoint, apiKey, transitRequestBody);

    if (transitResponse.ok) {
      transitData = await transitResponse.json();
    }
  }

  return normalizeEphemerisResponse(data, payload, requestBody, location, {
    designData,
    designRequestBody,
    designDate,
    designSunError,
    designAttempts,
    designRefinementSteps,
    transitData,
    transitRequestBody
  });
}

class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

function requestAstrologyChart(apiBaseUrl, endpoint, apiKey, requestBody) {
  return fetch(new URL(endpoint, apiBaseUrl).toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });
}

function createAstrologyApiPayload(payload, location, includeCoordinates) {
  const [year, month, day] = payload.birthDate.split("-").map(Number);
  const [hour, minute] = payload.birthTime.split(":").map(Number);
  return createAstrologyApiPayloadFromDateParts(
    { year, month, day, hour, minute, second: 0 },
    location,
    includeCoordinates,
    chartSubjectName(payload),
    payload.houseSystem,
    payload.zodiacType
  );
}

function chartSubjectName(payload, suffix = "") {
  const baseName = String(payload?.name || "MyHumanos").trim() || "MyHumanos";

  return suffix ? `${baseName} ${suffix}` : baseName;
}

function createAstrologyApiPayloadFromDateParts(parts, location, includeCoordinates, name, houseSystem = "P", zodiacType = "Tropic") {
  const birthData = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second || 0,
    city: location.city,
    country_code: location.countryCode
  };

  if (includeCoordinates) {
    birthData.latitude = location.latitude;
    birthData.longitude = location.longitude;
    birthData.lat = location.latitude;
    birthData.lng = location.longitude;
    birthData.timezone = location.timezone;
    birthData.tz_str = location.timezone;
  }

  return {
    subject: {
      name,
      birth_data: birthData
    },
    options: {
      house_system: houseSystem || "P",
      zodiac_type: zodiacType || "Tropic",
      active_points: [
        "Sun",
        "Moon",
        "Mercury",
        "Venus",
        "Mars",
        "Jupiter",
        "Saturn",
        "Uranus",
        "Neptune",
        "Pluto",
        "Chiron",
        "Mean_Node",
        "True_Node",
        "Ascendant",
        "Medium_Coeli"
      ],
      precision: 4
    }
  };
}

function normalizeEphemerisResponse(data, payload, requestBody, location, related = {}) {
  const points = extractAstrologyPoints(data);
  const designPoints = related.designData ? extractAstrologyPoints(related.designData) : [];
  const transitPoints = related.transitData ? extractAstrologyPoints(related.transitData) : [];
  const sun = findPoint(points, "Sun");
  const moon = findPoint(points, "Moon");
  const ascendant = findPoint(points, "Ascendant");
  const houses = extractHouses(data);
  const humanDesign = createHumanDesignPreview(points, payload, designPoints, transitPoints);
  const utcTime = convertLocalTimeToUtcIso(payload.birthDate, payload.birthTime, location.timezone);

  return {
    type: humanDesign.type,
    strategy: humanDesign.strategy,
    authority: humanDesign.authority,
    profile: humanDesign.profile,
    notSelf: humanDesign.notSelf,
    signature: humanDesign.signature,
    centers: humanDesign.definedCenters,
    gates: humanDesign.gates.map((gate) => gate.gate),
    metrics: [
      { label: "Typ", value: humanDesign.type },
      { label: "Strategie", value: humanDesign.strategy },
      { label: "Autorität", value: humanDesign.authority },
      { label: "Profil", value: humanDesign.profile },
      { label: "Sonne", value: formatPointShort(sun) || "n/a" },
      { label: "Mond", value: formatPointShort(moon) || "n/a" },
      { label: "Aszendent", value: formatPointShort(ascendant) || "n/a" }
    ],
    points,
    houses,
    humanDesign,
    design: {
      utcTime: related.designDate?.utcTime || "",
      localTime: related.designDate?.localTime || "",
      points: designPoints,
      request: related.designRequestBody,
      calculation: "exact_88_degree_solar_arc",
      sunErrorDegrees: Number.isFinite(related.designSunError) ? Number(related.designSunError.toFixed(4)) : null,
      attempts: related.designAttempts || 0,
      refinementSteps: related.designRefinementSteps || 0
    },
    transits: createTransitSummary(transitPoints, humanDesign),
    summary: humanDesign.summary,
    isMock: false,
    provider: "Swiss Ephemeris",
    raw: data,
    request: requestBody,
    location,
    time: {
      inputTime: payload.birthTime,
      inputDate: payload.birthDate,
      interpretedAs: location.timezone,
      utcTime,
      timezoneSource: location.timezoneSource || location.source,
      fallbackTimezone: location.source === "fallback" ? "Europe/Berlin" : null
    },
    input: {
      birthDate: payload.birthDate,
      birthTime: payload.birthTime,
      birthPlace: String(payload.birthPlace).trim(),
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone
    }
  };
}

function createHumanDesignPreview(points, payload, designPoints = [], transitPoints = []) {
  const personalityBodygraphPoints = selectBodygraphPoints(points);
  const designBodygraphPoints = selectBodygraphPoints(designPoints);
  const transitBodygraphPoints = selectBodygraphPoints(transitPoints);
  const personalityActivations = addDerivedBodygraphActivations(createActivations(personalityBodygraphPoints, "Personality"));
  const designActivations = addDerivedBodygraphActivations(createDesignActivations(personalityBodygraphPoints, designBodygraphPoints));
  const activations = [...personalityActivations, ...designActivations];
  const transitActivations = addDerivedBodygraphActivations(createActivations(transitBodygraphPoints, "Transit"));
  const activeBodygraphActivations = activations.length ? activations : personalityActivations;
  const personalitySun = personalityActivations.find((activation) => activation.planet === "Sun") || personalityActivations[0];
  const designSun = designActivations.find((activation) => activation.planet === "Sun") || null;
  const personalityEarth = personalityActivations.find((activation) => activation.planet === "Earth") || null;
  const designEarth = designActivations.find((activation) => activation.planet === "Earth") || null;
  const profile = `${personalitySun?.line || 1}/${designSun?.line || "?"}`;
  const channels = deriveDefinedChannels(activeBodygraphActivations);
  const definedCenters = deriveCentersFromChannels(channels);
  const type = deriveHumanDesignType(definedCenters, channels);
  const authority = deriveAuthority(definedCenters, channels);
  const strategy = strategyForType(type);
  const notSelf = notSelfForType(type);
  const signature = signatureForType(type);
  const gates = uniqueByGate(activeBodygraphActivations).slice(0, 18);

  return {
    name: payload.name || "Dein Chart",
    type,
    strategy,
    authority,
    profile,
    signature,
    notSelf,
    typeDescription: typeDescription(type),
    authorityDescription: authorityDescription(authority),
    strategyDescription: strategyDescription(type),
    profileLines: {
      personality: lineDescription(personalitySun?.line),
      design: lineDescription(designSun?.line),
      description: profileDescription(profile),
      source: {
        personalitySun: activationSource(personalitySun),
        designSun: activationSource(designSun)
      }
    },
    incarnationCross: createIncarnationCross(personalitySun, personalityEarth, designSun, designEarth),
    definedCenters,
    openCenters: ALL_CENTERS.filter((center) => !definedCenters.includes(center)),
    gates,
    channels,
    activations: activeBodygraphActivations,
    personalityActivations,
    designActivations,
    transitActivations,
    calculationNotes: [
      designSun
        ? "Profil = Personality-Sonnenlinie / Design-Sonnenlinie. Die Design-Sonne wird aus dem exakten 88-Grad-Sonnenbogen abgeleitet."
        : "Profil unvollständig: Für die zweite Profilzahl fehlt die Design-Sonne.",
      "Earth-Aktivierungen werden als Opposition der jeweiligen Sonne ergänzt, weil viele Natal-APIs Earth nicht direkt liefern.",
      "North/South Node werden als Achse gelesen; Chiron, Ascendent und MC bleiben astrologische Daten, aber definieren keinen klassischen Human-Design-Bodygraph.",
      "Typ, Zentren und Autorität werden aus vollständig definierten Kanälen abgeleitet."
    ],
    summary: designSun
      ? `${type} mit ${authority}-Autorität und Profil ${profile}. Personality und Design werden getrennt gelesen; definierte Zentren entstehen nur dort, wo komplette Kanäle aktiviert sind.`
      : `${type} mit ${authority}-Autorität. Die erste Profilzahl kommt aus der Personality-Sonne; die zweite braucht den Design-Zeitpunkt, etwa 88 Sonnenbogen-Grad vor der Geburt.`
  };
}

function activationSource(activation) {
  if (!activation) {
    return null;
  }

  return {
    gate: activation.gate,
    line: activation.line,
    longitude: Number.isFinite(activation.longitude) ? Number(activation.longitude.toFixed(4)) : null,
    sign: activation.sign || "",
    tone: activation.tone || ""
  };
}

function createActivations(points, layer) {
  return points
    .filter((point) => Number.isFinite(point.longitude))
    .map((point) => {
      const gateInfo = gateFromLongitude(point.longitude);

      return {
        planet: point.name,
        layer,
        sign: point.sign,
        degree: point.degree,
        longitude: point.longitude,
        house: point.house,
        retrograde: point.retrograde,
        ...gateInfo,
        tone: gateTone(gateInfo.gate)
      };
    });
}

function selectBodygraphPoints(points) {
  const selected = [];
  const bodygraphNames = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ];

  for (const name of bodygraphNames) {
    const point = findPointByNormalizedName(points, name);

    if (point) {
      selected.push(point);
    }
  }

  const northNode = findPointByNormalizedName(points, "true node")
    || findPointByNormalizedName(points, "north node")
    || findPointByNormalizedName(points, "mean node");

  if (northNode) {
    selected.push({ ...northNode, name: "North Node" });
  }

  return selected;
}

function addDerivedBodygraphActivations(activations) {
  return addSouthNodeActivation(addEarthActivation(activations));
}

function addEarthActivation(activations) {
  const sun = activations.find((activation) => activation.planet.toLowerCase() === "sun");
  const hasEarth = activations.some((activation) => activation.planet.toLowerCase() === "earth");

  if (!sun || hasEarth) {
    return activations;
  }

  const longitude = (((sun.longitude + 180) % 360) + 360) % 360;
  const gateInfo = gateFromLongitude(longitude);

  return [
    ...activations,
    {
      planet: "Earth",
      layer: sun.layer,
      sign: signFromLongitude(longitude),
      degree: longitude % 30,
      longitude,
      house: null,
      retrograde: false,
      ...gateInfo,
      tone: gateTone(gateInfo.gate)
    }
  ];
}

function addSouthNodeActivation(activations) {
  const northNode = activations.find((activation) => isNorthNodeName(activation.planet));
  const hasSouthNode = activations.some((activation) => activation.planet.toLowerCase() === "south node");

  if (!northNode || hasSouthNode) {
    return activations;
  }

  const longitude = normalizeLongitude(northNode.longitude + 180);
  const gateInfo = gateFromLongitude(longitude);

  return [
    ...activations,
    {
      planet: "South Node",
      layer: northNode.layer,
      sign: signFromLongitude(longitude),
      degree: longitude % 30,
      longitude,
      house: null,
      retrograde: northNode.retrograde,
      ...gateInfo,
      tone: gateTone(gateInfo.gate)
    }
  ];
}

function createDesignActivations(personalityPoints, designPoints) {
  const activations = createActivations(designPoints, "Design");
  const personalitySun = personalityPoints.find((point) => point.name.toLowerCase() === "sun");
  const exactDesignSunLongitude = Number.isFinite(personalitySun?.longitude)
    ? (((personalitySun.longitude - 88) % 360) + 360) % 360
    : null;

  if (!Number.isFinite(exactDesignSunLongitude)) {
    return activations;
  }

  const exactSunActivation = {
    planet: "Sun",
    layer: "Design",
    sign: signFromLongitude(exactDesignSunLongitude),
    degree: exactDesignSunLongitude % 30,
    longitude: exactDesignSunLongitude,
    house: null,
    retrograde: false,
    ...gateFromLongitude(exactDesignSunLongitude)
  };
  exactSunActivation.tone = gateTone(exactSunActivation.gate);

  return [
    exactSunActivation,
    ...activations.filter((activation) => activation.planet.toLowerCase() !== "sun")
  ];
}

function createIncarnationCross(personalitySun, personalityEarth, designSun, designEarth) {
  const gates = [
    { label: "Personality Sun", activation: personalitySun },
    { label: "Personality Earth", activation: personalityEarth },
    { label: "Design Sun", activation: designSun },
    { label: "Design Earth", activation: designEarth }
  ].filter((item) => item.activation);

  return {
    gates: gates.map((item) => ({
      label: item.label,
      gate: item.activation.gate,
      line: item.activation.line,
      tone: item.activation.tone
    })),
    title: gates.length === 4
      ? `${personalitySun.gate}/${personalityEarth.gate} - ${designSun.gate}/${designEarth.gate}`
      : "Inkarnationskreuz noch unvollständig",
    description: "Das Kreuz zeigt die vier Hauptachsen aus Personality Sun/Earth und Design Sun/Earth."
  };
}

function lineDescription(line) {
  return {
    1: "Linie 1 - Fundament, Forschung, Sicherheit durch Verstehen",
    2: "Linie 2 - natürliches Talent, Rückzug, gerufen werden",
    3: "Linie 3 - Erfahrung, Versuch und Irrtum, praktische Weisheit",
    4: "Linie 4 - Netzwerk, Beziehung, Einfluss durch Vertrauen",
    5: "Linie 5 - Projektion, Lösungskraft, Verantwortung unter Erwartung",
    6: "Linie 6 - Reifung, Vorbild, Blick aus Erfahrung"
  }[Number(line)] || "Linie offen";
}

function profileDescription(profile) {
  return {
    "1/3": "Forscher/Experimentierer: Sicherheit durch Wissen und gelebte Tests.",
    "1/4": "Forscher/Opportunist: Fundament und Einfluss durch vertraute Beziehungen.",
    "2/4": "Eremit/Opportunist: Rückzug, Talent und ein Feld, das dich ruft.",
    "2/5": "Eremit/Ketzer: verborgenes Talent trifft starke Projektionen von außen.",
    "3/5": "Märtyrer/Ketzer: Lernen durch Erfahrung und Lösungen für andere.",
    "3/6": "Märtyrer/Vorbild: erst ausprobieren, später gereift vorleben.",
    "4/1": "Opportunist/Forscher: feste innere Grundlage und Wirkung im Netzwerk.",
    "4/6": "Opportunist/Vorbild: Beziehungseinfluss mit langer Reifung.",
    "5/1": "Ketzer/Forscher: praktische Lösungen brauchen ein solides Fundament.",
    "5/2": "Ketzer/Eremit: Projektionen, Rückzug und natürliche Gabe im geschützten Raum.",
    "6/2": "Vorbild/Eremit: gereifte Weisheit und natürliches, nicht erzwungenes Talent.",
    "6/3": "Vorbild/Märtyrer: Weisheit entsteht aus gelebter Erfahrung."
  }[profile] || "Profil wird aus Personality-Sonne und Design-Sonne gelesen.";
}

function typeDescription(type) {
  return {
    Generator: "Definiertes Sakral: konstante Lebensenergie, die auf Resonanz reagieren will.",
    "Manifestierender Generator": "Definiertes Sakral mit Motor-zur-Kehle-Verbindung: schnelle Reaktion, Korrektur und Bewegung.",
    Projektor: "Kein definiertes Sakral und keine Motor-zur-Kehle-Manifestation: Wahrnehmung, Führung und Timing.",
    Manifestor: "Motor-zur-Kehle ohne Sakral: initiierende Energie, die Widerstand durch Informieren reduziert.",
    Reflektor: "Keine definierten Zentren: Spiegel des Feldes, Klarheit über Zeit und Umgebung."
  }[type] || "Typ wird aus Zentren und Kanälen abgeleitet.";
}

function strategyDescription(type) {
  return {
    Generator: "Warte auf etwas im Außen und prüfe die körperliche Antwort.",
    "Manifestierender Generator": "Reagiere zuerst, informiere dann die Betroffenen und erlaube Kurswechsel.",
    Projektor: "Warte bei großen Lebensbereichen auf Anerkennung und Einladung.",
    Manifestor: "Informiere vor dem Handeln, damit dein Impuls weniger Widerstand erzeugt.",
    Reflektor: "Gib Entscheidungen Zeit und beobachte den Mondzyklus."
  }[type] || "Folge deiner Strategie als erstem Experiment.";
}

function authorityDescription(authority) {
  return {
    Emotional: "Klarheit entsteht über eine emotionale Welle, nicht im ersten Moment.",
    Sakral: "Die Antwort zeigt sich körperlich als Ja/Nein-Resonanz.",
    Milz: "Klarheit ist leise, schnell und instinktiv im Jetzt.",
    Ego: "Entscheidung läuft über Wille, Versprechen und stimmige Verpflichtung.",
    "Selbst-projiziert": "Klarheit entsteht beim Sprechen aus Richtung und Identität.",
    "Mental / Umgebung": "Klarheit entsteht durch richtige Umgebung und Aussprechen, nicht durch innere Autorität.",
    Lunar: "Klarheit entsteht über Zeit, Spiegelung und den Mondzyklus."
  }[authority] || "Autorität wird aus der Hierarchie definierter Zentren gelesen.";
}

function createTransitSummary(transitPoints, humanDesign) {
  const transitActivations = addDerivedBodygraphActivations(createActivations(transitPoints, "Transit"));

  if (!transitActivations.length) {
    return {
      enabled: false,
      generatedAt: null,
      gates: [],
      channels: [],
      today: null,
      summary: "Tagestransite sind vorbereitet, aber noch nicht automatisch aktiv. So bleibt dein AstroAPI-Kontingent geschont."
    };
  }

  const natalActivations = Array.isArray(humanDesign.activations) ? humanDesign.activations : [];
  const natalChannelNames = new Set((humanDesign.channels || []).map((channel) => channel.name));
  const transitChannels = deriveDefinedChannels([...natalActivations, ...transitActivations])
    .filter((channel) => !natalChannelNames.has(channel.name));
  const gates = uniqueByGate(transitActivations).slice(0, 12);

  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    gates,
    channels: transitChannels,
    today: createTodayTransitReading(gates, transitChannels, humanDesign),
    summary: transitChannels.length
      ? `Heute berühren die Transite ${gates.length} Tore und öffnen ${transitChannels.length} temporäre Kanal-Themen.`
      : `Heute berühren die Transite ${gates.length} Tore, ohne einen neuen kompletten Kanal zu bilden.`
  };
}

function createTodayTransitReading(gates, transitChannels, humanDesign) {
  const firstGate = gates[0] || null;
  const secondGate = gates[1] || null;
  const openCenters = Array.isArray(humanDesign.openCenters) ? humanDesign.openCenters : [];
  const definedCenters = Array.isArray(humanDesign.definedCenters) ? humanDesign.definedCenters : [];
  const profile = humanDesign.profile || "";
  const type = humanDesign.type || "";
  const notSelf = humanDesign.notSelf || "";
  const signature = humanDesign.signature || "";
  const centerTheme = openCenters.length
    ? openCenterTransitTheme(openCenters[0])
    : definedCenterTransitTheme(definedCenters[0]);
  const transitTheme = firstGate
    ? `Tor ${firstGate.gate}.${firstGate.line || "?"} bringt heute das Thema ${gateTone(firstGate.gate)} in den Vordergrund.`
    : "Heute ist weniger ein einzelnes Tor wichtig als die Qualität deiner eigenen Strategie.";
  const secondTheme = secondGate
    ? `Als zweiter Klang wirkt Tor ${secondGate.gate}.${secondGate.line || "?"}: ${gateTone(secondGate.gate)}.`
    : "";

  return {
    title: todayTitleForType(type),
    mantra: todayMantra(type, profile),
    transitTheme,
    secondTheme,
    bodyCue: todayBodyCue(type, humanDesign.authority),
    conditioning: centerTheme,
    wound: conditioningWound(type, profile, openCenters, notSelf),
    gift: signature
      ? `Dein Selbst-Signal heute: ${signature}. Nicht als Ziel erzwingen, sondern als Zeichen erkennen, wenn der Druck weicher wird.`
      : "Dein Selbst-Signal zeigt sich eher als Entspannung als als perfekte Antwort.",
    channelTheme: transitChannels.length
      ? `Transit-Kanäle können heute temporär mehr Festigkeit erzeugen: ${transitChannels.slice(0, 2).map((channel) => channel.name).join(", ")}. Beobachte, ohne dich sofort damit zu identifizieren.`
      : "Heute entsteht kein zusätzlicher kompletter Transit-Kanal. Die Tagesenergie wirkt eher über einzelne Tore, Stimmungen und kleine Impulse.",
    prompts: todayPrompts(type, profile, openCenters)
  };
}

function todayTitleForType(type) {
  return {
    Generator: "Heute über Resonanz gehen",
    "Manifestierender Generator": "Heute reagieren, dann bewegen",
    Projektor: "Heute Anerkennung statt Druck suchen",
    Manifestor: "Heute den Impuls klar machen",
    Reflektor: "Heute das Feld lesen"
  }[type] || "Heute dein Feld beobachten";
}

function todayMantra(type, profile) {
  const base = {
    Generator: "Nicht alles, was möglich ist, ist ein Ja.",
    "Manifestierender Generator": "Ein Kurswechsel kann ein Zeichen von Wahrheit sein.",
    Projektor: "Du musst nicht lauter werden, um gesehen zu werden.",
    Manifestor: "Dein Impuls darf Raum nehmen, wenn du das Feld informierst.",
    Reflektor: "Was heute durch dich geht, muss nicht für immer du sein."
  }[type] || "Heute reicht ein ehrlicher nächster Schritt.";

  if (profile === "5/2") {
    return `${base} Nicht jede Projektion ist ein Ruf.`;
  }

  return base;
}

function todayBodyCue(type, authority) {
  if (authority === "Lunar") {
    return "Körperhinweis: Wenn etwas dringend wirkt, ist es wahrscheinlich noch nicht reif. Sammle Eindrücke über mehrere Tage.";
  }

  return {
    Generator: "Körperhinweis: Achte auf Öffnung, Lebendigkeit und ein klares Bauch-Ja.",
    "Manifestierender Generator": "Körperhinweis: Erst Reaktion, dann Tempo. Nicht jedes schnelle Ja bleibt ein Ja.",
    Projektor: "Körperhinweis: Erholung ist Information. Müdigkeit kann zeigen, dass das Feld dich falsch nutzt.",
    Manifestor: "Körperhinweis: Spüre, ob der Impuls wirklich aus dir kommt oder nur eine Reaktion auf Druck ist."
  }[type] || "Körperhinweis: Verlangsame die Entscheidung, bis dein System weniger angespannt ist.";
}

function openCenterTransitTheme(center) {
  const themes = {
    Kopf: "Offener Kopf: Heute können Fragen lauter wirken als nötig. Nicht jede Frage braucht deine Energie.",
    Ajna: "Offenes Ajna: Du musst heute nicht sicher klingen, um wahr zu sein.",
    Kehle: "Offene Kehle: Achte auf den Drang, Aufmerksamkeit durch Worte zu erzwingen.",
    "G-Zentrum": "Offenes G-Zentrum: Richtung und Liebe dürfen heute über den richtigen Ort spürbarer werden.",
    Ego: "Offenes Ego: Beweise heute weniger. Versprechen sind nur stark, wenn sie frei gegeben werden.",
    Milz: "Offene Milz: Halte nicht fest, nur weil es bekannt wirkt.",
    Sakral: "Offenes Sakral: Genug ist genug. Fremde Energie ist kein Lebensauftrag.",
    Solarplexus: "Offener Solarplexus: Wahrheit braucht keine Konfliktvermeidung.",
    Wurzel: "Offene Wurzel: Eile ist heute kein Beweis für Wichtigkeit."
  };

  return themes[center] || "Offene Zentren zeigen heute, wo du fremde Energie besonders deutlich spürst.";
}

function definedCenterTransitTheme(center) {
  const themes = {
    Kopf: "Definierter Kopf: Deine Inspiration kann heute konstant wirken. Prüfe trotzdem, was wirklich relevant ist.",
    Ajna: "Definiertes Ajna: Mentale Struktur ist da. Lass sie dienen, nicht herrschen.",
    Kehle: "Definierte Kehle: Ausdruck sucht Form. Sprich klar, aber nicht aus Druck.",
    "G-Zentrum": "Definiertes G-Zentrum: Richtung und Identität sind heute ein verlässlicher Anker.",
    Ego: "Definiertes Ego: Wille ist da. Nutze ihn für stimmige Versprechen.",
    Milz: "Definierte Milz: Instinkt ist präsent. Höre die leise erste Wahrheit.",
    Sakral: "Definiertes Sakral: Energie ist da, wenn Resonanz da ist.",
    Solarplexus: "Definierter Solarplexus: Emotionale Wahrheit braucht Welle und Zeit.",
    Wurzel: "Definierte Wurzel: Druck kann Motor sein, muss aber nicht alles sofort lösen."
  };

  return themes[center] || "Definierte Zentren zeigen heute, wo Konstanz in deinem System liegt.";
}

function conditioningWound(type, profile, openCenters, notSelf) {
  if (type === "Reflektor") {
    return "Prägung heute: Die alte Wunde kann sein, dich für die Stimmung des Raumes verantwortlich zu fühlen. Dein Schutz ist Auswahl: Ort, Menschen, Timing.";
  }

  if (profile === "5/2") {
    return "Prägung heute: Andere können etwas in dich hineinsehen und sofort eine Lösung erwarten. Du darfst prüfen, ob du wirklich gerufen bist.";
  }

  if (openCenters.includes("Ego")) {
    return "Prägung heute: Der Drang, Wert zu beweisen, kann lauter werden. Du musst dich nicht verdienen.";
  }

  return notSelf
    ? `Prägung heute: Wenn ${notSelf} auftaucht, ist das kein Fehler, sondern ein Hinweis auf Konditionierung.`
    : "Prägung heute: Beobachte, wo du dich anstrengst, um jemand zu sein, der du gerade nicht bist.";
}

function todayPrompts(type, profile, openCenters) {
  const prompts = [
    "Was fühlt sich heute leicht, aber wahr an?",
    "Wo entsteht Druck, nur weil andere ihn tragen?"
  ];

  if (type === "Reflektor") {
    prompts.push("In welchem Raum fühlst du dich heute weiter, ruhiger oder ehrlicher?");
  } else if (profile === "5/2") {
    prompts.push("Welche Erwartung an dich ist heute eine Projektion und kein echter Ruf?");
  } else if (openCenters.length) {
    prompts.push(`Was lernst du heute über dein offenes ${openCenters[0]}?`);
  } else {
    prompts.push("Welche Entscheidung wird klarer, wenn du sie nicht sofort erzwingst?");
  }

  return prompts;
}

async function resolveBirthLocation(payload) {
  const typedPlace = parseBirthPlace(payload.birthPlace);
  const directLatitude = Number(payload.latitude ?? payload.lat);
  const directLongitude = Number(payload.longitude ?? payload.lng ?? payload.lon);
  const typedCoordinates = parseCoordinatePair(payload.birthPlace);
  const requestedTimezone = normalizeTimezone(payload.timezone);

  if (Number.isFinite(directLatitude) && Number.isFinite(directLongitude)) {
    return {
      city: typedPlace.city,
      countryCode: typedPlace.countryCode,
      country: typedPlace.countryCode,
      latitude: directLatitude,
      longitude: directLongitude,
      timezone: requestedTimezone || defaultTimezoneForCountry(typedPlace.countryCode),
      timezoneSource: requestedTimezone ? "manual" : "country-fallback",
      source: "coordinates"
    };
  }

  if (typedCoordinates) {
    return {
      city: typedPlace.city || "Koordinaten",
      countryCode: typedPlace.countryCode,
      country: typedPlace.countryCode,
      latitude: typedCoordinates.latitude,
      longitude: typedCoordinates.longitude,
      timezone: requestedTimezone || defaultTimezoneForCountry(typedPlace.countryCode),
      timezoneSource: requestedTimezone ? "manual" : "country-fallback",
      source: "coordinates"
    };
  }

  try {
    const geocoded = await geocodeBirthPlace(payload, typedPlace);

    if (geocoded) {
      return geocoded;
    }
  } catch {
    // Keep chart calculation available even when the free geocoder is temporarily unavailable.
  }

  return {
    city: typedPlace.city,
    countryCode: typedPlace.countryCode,
    country: typedPlace.countryCode,
    latitude: typedPlace.latitude,
    longitude: typedPlace.longitude,
    timezone: requestedTimezone || defaultTimezoneForCountry(typedPlace.countryCode),
    timezoneSource: requestedTimezone ? "manual" : "country-fallback",
    source: "fallback"
  };
}

async function geocodeBirthPlace(payload, typedPlace) {
  const query = String(payload.birthPlace).trim();
  const requestedTimezone = normalizeTimezone(payload.timezone);

  if (!query) {
    return null;
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", typedPlace.city || query);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "de");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  const result = results.find((item) => item.country_code === typedPlace.countryCode) || results[0] || null;

  if (!result || !Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) {
    return null;
  }

  return {
    city: result.name || typedPlace.city,
    countryCode: result.country_code || typedPlace.countryCode,
    country: result.country || typedPlace.countryCode,
    admin1: result.admin1 || "",
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    timezone: requestedTimezone || result.timezone || defaultTimezoneForCountry(result.country_code || typedPlace.countryCode),
    timezoneSource: requestedTimezone ? "manual" : result.timezone ? "geocoding" : "country-fallback",
    source: "geocoding"
  };
}

function parseCoordinatePair(value) {
  const match = String(value || "").match(/(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeTimezone(value) {
  const timezone = String(value || "").trim();

  if (!timezone || timezone === "auto") {
    return "";
  }

  if (!/^[A-Za-z_]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?$/.test(timezone)) {
    return "";
  }

  return timezone;
}

function calculateDesignDate(payload, location) {
  const birthUtcIso = convertLocalTimeToUtcIso(payload.birthDate, payload.birthTime, location.timezone);
  const birthUtc = birthUtcIso ? new Date(birthUtcIso) : new Date(`${payload.birthDate}T${payload.birthTime}:00Z`);
  const designUtc = new Date(birthUtc.getTime() - (88 / 0.98564736) * 24 * 60 * 60 * 1000);

  return designDateFromUtc(designUtc, location.timezone);
}

function designDateFromUtc(date, timezone) {
  const localParts = utcDateToLocalParts(date, timezone);

  return {
    utcTime: date.toISOString(),
    localTime: `${String(localParts.year).padStart(4, "0")}-${String(localParts.month).padStart(2, "0")}-${String(localParts.day).padStart(2, "0")} ${String(localParts.hour).padStart(2, "0")}:${String(localParts.minute).padStart(2, "0")} ${timezone}`,
    localParts
  };
}

function designSunLongitudeFromNatal(points) {
  const sun = findPoint(points, "Sun");

  if (!Number.isFinite(sun?.longitude)) {
    return null;
  }

  return normalizeLongitude(sun.longitude - 88);
}

function refineDesignDateBySunError(designDate, sunErrorDegrees, timezone) {
  if (!Number.isFinite(sunErrorDegrees)) {
    return designDate;
  }

  const utc = new Date(designDate.utcTime);

  if (Number.isNaN(utc.getTime())) {
    return designDate;
  }

  const SOLAR_DAILY_MOTION = 0.98564736;
  const adjustmentMs = (sunErrorDegrees / SOLAR_DAILY_MOTION) * 24 * 60 * 60 * 1000;

  return designDateFromUtc(new Date(utc.getTime() + adjustmentMs), timezone);
}

function signedLongitudeDelta(targetLongitude, currentLongitude) {
  if (!Number.isFinite(targetLongitude) || !Number.isFinite(currentLongitude)) {
    return null;
  }

  return (((targetLongitude - currentLongitude + 540) % 360) - 180);
}

function normalizeLongitude(longitude) {
  return (((longitude % 360) + 360) % 360);
}

function parseDesignRefinementSteps(value) {
  const steps = Number.parseInt(value ?? "1", 10);

  if (!Number.isFinite(steps)) {
    return 1;
  }

  return Math.max(0, Math.min(3, steps));
}

function utcDateToLocalParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Europe/Berlin",
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function convertLocalTimeToUtcIso(dateValue, timeValue, timezone) {
  try {
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);

    for (let index = 0; index < 3; index += 1) {
      const offsetMinutes = getTimezoneOffsetMinutes(new Date(utcMillis), timezone);
      utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60000;
    }

    return new Date(utcMillis).toISOString();
  } catch {
    return "";
  }
}

function getTimezoneOffsetMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Europe/Berlin",
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  const localAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);

  return (localAsUtc - date.getTime()) / 60000;
}

function defaultTimezoneForCountry(countryCode) {
  const zones = {
    DE: "Europe/Berlin",
    AT: "Europe/Vienna",
    CH: "Europe/Zurich",
    FR: "Europe/Paris",
    ES: "Europe/Madrid",
    IT: "Europe/Rome",
    GB: "Europe/London",
    UK: "Europe/London",
    US: "America/New_York"
  };

  return zones[String(countryCode || "DE").toUpperCase()] || "Europe/Berlin";
}

function gateFromLongitude(longitude) {
  const gateOrder = [
    41, 19, 13, 49, 30, 55, 37, 63,
    22, 36, 25, 17, 21, 51, 42, 3,
    27, 24, 2, 23, 8, 20, 16, 35,
    45, 12, 15, 52, 39, 53, 62, 56,
    31, 33, 7, 4, 29, 59, 40, 64,
    47, 6, 46, 18, 48, 57, 32, 50,
    28, 44, 1, 43, 14, 34, 9, 5,
    26, 11, 10, 58, 38, 54, 61, 60
  ];
  const raveMandalaStart = 302;
  const normalized = (((longitude - raveMandalaStart) % 360) + 360) % 360;
  const gateSize = 360 / 64;
  const index = Math.floor(normalized / gateSize) % 64;
  const line = Math.floor((normalized % gateSize) / (gateSize / 6)) + 1;

  return {
    gate: gateOrder[index],
    line: Math.min(line, 6),
    gateIndex: index + 1,
    percentage: Number(((normalized % gateSize) / gateSize).toFixed(3))
  };
}

function gateTone(gate) {
  const tones = {
    1: "kreativer Ausdruck", 2: "innere Richtung", 3: "Anfang im Chaos", 4: "mentale Antworten",
    5: "Rhythmus", 6: "emotionale Grenzen", 7: "Führung", 8: "Beitrag", 9: "Fokus",
    10: "Selbstliebe", 11: "Ideen", 12: "Stimmung und Ausdruck", 13: "Zuhören",
    14: "Ressourcen", 15: "Extreme", 16: "Talent", 17: "Meinung", 18: "Korrektur",
    19: "Bedürfnisse", 20: "Jetzt-Ausdruck", 21: "Kontrolle", 22: "Anmut", 23: "Vereinfachung",
    24: "Rückkehr", 25: "Unschuld", 26: "Einfluss", 27: "Fürsorge", 28: "Sinnsuche",
    29: "Commitment", 30: "Verlangen", 31: "Einfluss", 32: "Beständigkeit", 33: "Rückzug",
    34: "Power", 35: "Erfahrung", 36: "Krise und Wachstum", 37: "Gemeinschaft", 38: "Kampfgeist",
    39: "Provokation", 40: "Alleinsein", 41: "Startimpuls", 42: "Wachstum", 43: "Durchbruch",
    44: "Mustererkennung", 45: "Ressourcenführung", 46: "Körperliebe", 47: "Sinnfindung",
    48: "Tiefe", 49: "Prinzipien", 50: "Werte", 51: "Initiation", 52: "Stillstand",
    53: "Beginn", 54: "Ambition", 55: "Spirit", 56: "Storytelling", 57: "Intuition",
    58: "Lebensfreude", 59: "Intimität", 60: "Limitierung", 61: "innere Wahrheit",
    62: "Details", 63: "Zweifel", 64: "Verwirrung"
  };

  tones[13] = "Zuhören";
  tones[32] = "Beständigkeit";
  tones[59] = "Intimität";

  return tones[gate] || "Aktivierung";
}

function uniqueByGate(activations) {
  const seen = new Set();
  return activations.filter((activation) => {
    if (seen.has(activation.gate)) return false;
    seen.add(activation.gate);
    return true;
  });
}

const ALL_CENTERS = ["Kopf", "Ajna", "Kehle", "G-Zentrum", "Ego", "Milz", "Sakral", "Solarplexus", "Wurzel"];
const MOTOR_CENTERS = ["Ego", "Solarplexus", "Sakral", "Wurzel"];
const CHANNEL_DEFINITIONS = [
  [64, 47, "Kopf", "Ajna"], [61, 24, "Kopf", "Ajna"], [63, 4, "Kopf", "Ajna"],
  [17, 62, "Ajna", "Kehle"], [43, 23, "Ajna", "Kehle"], [11, 56, "Ajna", "Kehle"],
  [31, 7, "Kehle", "G-Zentrum"], [8, 1, "Kehle", "G-Zentrum"], [33, 13, "Kehle", "G-Zentrum"],
  [20, 10, "Kehle", "G-Zentrum"], [25, 51, "G-Zentrum", "Ego"],
  [2, 14, "G-Zentrum", "Sakral"], [5, 15, "Sakral", "G-Zentrum"], [29, 46, "Sakral", "G-Zentrum"], [10, 34, "G-Zentrum", "Sakral"],
  [20, 34, "Kehle", "Sakral"], [57, 34, "Milz", "Sakral"], [27, 50, "Sakral", "Milz"],
  [59, 6, "Sakral", "Solarplexus"], [3, 60, "Sakral", "Wurzel"], [42, 53, "Sakral", "Wurzel"], [9, 52, "Sakral", "Wurzel"],
  [20, 57, "Kehle", "Milz"], [16, 48, "Kehle", "Milz"], [10, 57, "G-Zentrum", "Milz"],
  [44, 26, "Milz", "Ego"], [32, 54, "Milz", "Wurzel"], [28, 38, "Milz", "Wurzel"], [18, 58, "Milz", "Wurzel"],
  [21, 45, "Ego", "Kehle"], [37, 40, "Solarplexus", "Ego"],
  [12, 22, "Kehle", "Solarplexus"], [35, 36, "Kehle", "Solarplexus"],
  [19, 49, "Wurzel", "Solarplexus"], [39, 55, "Wurzel", "Solarplexus"], [41, 30, "Wurzel", "Solarplexus"]
].map(([gateA, gateB, from, to]) => ({ gateA, gateB, from, to }));

function deriveDefinedChannels(activations) {
  const gates = new Set(activations.map((activation) => activation.gate));

  return CHANNEL_DEFINITIONS
    .filter((channel) => gates.has(channel.gateA) && gates.has(channel.gateB))
    .map((channel) => ({
      ...channel,
      name: `${channel.gateA}-${channel.gateB}`,
      gates: [channel.gateA, channel.gateB]
    }));
}

function deriveCentersFromChannels(channels) {
  return [...new Set(channels.flatMap((channel) => [channel.from, channel.to]))].filter((center) => ALL_CENTERS.includes(center));
}

function deriveHumanDesignType(centers, channels) {
  const hasSacral = centers.includes("Sakral");
  const hasThroat = centers.includes("Kehle");
  const hasMotorToThroatHint = hasThroat && MOTOR_CENTERS.some((motor) => isCenterConnectedTo("Kehle", motor, channels));

  if (!centers.length) return "Reflektor";
  if (hasSacral && hasMotorToThroatHint) return "Manifestierender Generator";
  if (hasSacral) return "Generator";
  if (hasMotorToThroatHint) return "Manifestor";
  return "Projektor";
}

function isCenterConnectedTo(start, target, channels) {
  if (start === target) return true;
  const queue = [start];
  const seen = new Set(queue);

  while (queue.length) {
    const center = queue.shift();
    const neighbors = channels.flatMap((channel) => {
      if (channel.from === center) return [channel.to];
      if (channel.to === center) return [channel.from];
      return [];
    });

    for (const neighbor of neighbors) {
      if (neighbor === target) return true;
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return false;
}

function deriveAuthority(centers, channels) {
  if (centers.includes("Solarplexus")) return "Emotional";
  if (centers.includes("Sakral")) return "Sakral";
  if (centers.includes("Milz")) return "Milz";
  if (centers.includes("Ego")) return "Ego";
  if (centers.includes("G-Zentrum")) return "Selbst-projiziert";
  if (centers.some((center) => ["Kopf", "Ajna", "Kehle"].includes(center))) return "Mental / Umgebung";
  return channels.length ? "Keine innere Autorität erkannt" : "Lunar";
}

function strategyForType(type) {
  return {
    Generator: "Reagieren",
    "Manifestierender Generator": "Reagieren und informieren",
    Projektor: "Auf Einladung warten",
    Manifestor: "Informieren",
    Reflektor: "Mondzyklus abwarten"
  }[type] || "Reagieren";
}

function notSelfForType(type) {
  return {
    Generator: "Frustration",
    "Manifestierender Generator": "Frustration und Ungeduld",
    Projektor: "Bitterkeit",
    Manifestor: "Wut",
    Reflektor: "Enttäuschung"
  }[type] || "Widerstand";
}

function signatureForType(type) {
  return {
    Generator: "Zufriedenheit",
    "Manifestierender Generator": "Zufriedenheit",
    Projektor: "Erfolg",
    Manifestor: "Frieden",
    Reflektor: "Überraschung"
  }[type] || "Klarheit";
}

function parseBirthPlace(value) {
  const parts = String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts[0] || String(value).trim();
  const countryInput = parts[1] || "DE";
  const countryCode = normalizeCountryCode(countryInput);

  const fallbackCoordinates = fallbackCoordinatesForCountry(countryCode);

  return { city, countryCode, ...fallbackCoordinates };
}

function fallbackCoordinatesForCountry(countryCode) {
  const coordinates = {
    DE: { latitude: 52.52, longitude: 13.405 },
    AT: { latitude: 48.2082, longitude: 16.3738 },
    CH: { latitude: 46.948, longitude: 7.4474 },
    FR: { latitude: 48.8566, longitude: 2.3522 },
    ES: { latitude: 40.4168, longitude: -3.7038 },
    IT: { latitude: 41.9028, longitude: 12.4964 },
    GB: { latitude: 51.5072, longitude: -0.1276 },
    US: { latitude: 40.7128, longitude: -74.006 }
  };

  return coordinates[String(countryCode || "DE").toUpperCase()] || coordinates.DE;
}

function normalizeCountryCode(value) {
  const normalized = String(value).trim().toLowerCase();
  const countries = {
    de: "DE",
    deu: "DE",
    germany: "DE",
    deutschland: "DE",
    at: "AT",
    austria: "AT",
    oesterreich: "AT",
    osterreich: "AT",
    ch: "CH",
    switzerland: "CH",
    schweiz: "CH",
    us: "US",
    usa: "US",
    "united states": "US",
    gb: "GB",
    uk: "GB",
    "united kingdom": "GB",
    fr: "FR",
    france: "FR",
    frankreich: "FR",
    es: "ES",
    spain: "ES",
    spanien: "ES",
    it: "IT",
    italy: "IT",
    italien: "IT"
  };

  if (/^[a-z]{2}$/i.test(value)) {
    return value.toUpperCase();
  }

  return countries[normalized] || "DE";
}

function extractAstrologyPoints(data) {
  const candidates = [
    data?.points,
    data?.planets,
    data?.positions,
    data?.chart?.points,
    data?.chart?.planets,
    data?.data?.points,
    data?.data?.planets,
    data?.data?.positions,
    data?.natal?.points,
    data?.natal?.planets,
    data?.chart_data?.planetary_positions
  ];
  const source = candidates.find((candidate) => Array.isArray(candidate) || isPlainObject(candidate));

  if (!source) {
    return [];
  }

  const entries = Array.isArray(source)
    ? source.map((point) => [point.name || point.id || point.point || point.body, point])
    : Object.entries(source);

  return entries
    .map(([name, point]) => normalizePoint(name, point))
    .filter((point) => point.name);
}

function normalizePoint(name, point) {
  const longitude = firstNumber(point?.longitude, point?.absolute_longitude, point?.lon, point?.position);

  return {
    name: String(name || "").replaceAll("_", " "),
    sign: point?.sign || point?.zodiac_sign || signFromLongitude(longitude),
    degree: firstNumber(point?.degree, point?.degrees, point?.degree_in_sign, point?.sign_degree),
    longitude,
    house: point?.house || point?.house_number || null,
    retrograde: Boolean(point?.retrograde || point?.is_retrograde)
  };
}

function extractHouses(data) {
  const source = data?.houses || data?.house_cusps || data?.chart?.houses || data?.data?.houses || data?.chart_data?.house_cusps;

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map((house, index) => ({
    number: house.number || house.house || index + 1,
    sign: house.sign || house.zodiac_sign || signFromLongitude(firstNumber(house.longitude, house.cusp)),
    longitude: firstNumber(house.longitude, house.cusp)
  }));
}

function findPoint(points, name) {
  return points.find((point) => point.name.toLowerCase() === name.toLowerCase());
}

function findPointByNormalizedName(points, name) {
  const normalizedName = normalizePointName(name);

  return points.find((point) => normalizePointName(point.name) === normalizedName);
}

function isNorthNodeName(name) {
  return ["north node", "true node", "mean node"].includes(normalizePointName(name));
}

function normalizePointName(name) {
  return String(name || "").replaceAll("_", " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function formatPointShort(point) {
  if (!point) {
    return "";
  }

  const degree = Number.isFinite(point.degree) ? `${point.degree.toFixed(1)} deg ` : "";
  const sign = point.sign || "";

  return `${degree}${sign}`.trim();
}

function deriveChartHighlights(points) {
  const signs = points.map((point) => point.sign).filter(Boolean);
  const uniqueSigns = [...new Set(signs)].slice(0, 5);

  return uniqueSigns.length ? uniqueSigns : ["Kopf", "Ajna", "Kehle"];
}

function deriveChartMarkers(points) {
  const markers = points
    .map((point) => point.longitude)
    .filter(Number.isFinite)
    .map((longitude) => (Math.floor((longitude % 360) / 5.625) % 64) + 1)
    .slice(0, 8);

  return markers.length ? markers : [5, 14, 29, 34, 46, 57];
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function signFromLongitude(longitude) {
  if (!Number.isFinite(longitude)) {
    return "";
  }

  return ["Ari", "Tau", "Gem", "Can", "Leo", "Vir", "Lib", "Sco", "Sag", "Cap", "Aqu", "Pis"][
    Math.floor((((longitude % 360) + 360) % 360) / 30)
  ];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pick(values, seed) {
  return values[Math.abs(seed) % values.length];
}

function hash(value) {
  return Array.from(value).reduce((accumulator, char) => {
    return ((accumulator << 5) - accumulator + char.charCodeAt(0)) >>> 0;
  }, 2166136261);
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
