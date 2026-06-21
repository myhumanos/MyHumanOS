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

  const ephemerisChart = await createEphemerisChart(context.env, payload);

  if (ephemerisChart) {
    const publicChart = await savePublicChart(context.env, ephemerisChart, payload);

    return json({ ...ephemerisChart, publicChart });
  }

  const mockChart = createMockChart(payload);
  const publicChart = await savePublicChart(context.env, mockChart, payload);

  return json({ ...mockChart, publicChart });
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

const PUBLIC_CHART_INDEX_KEY = "public-charts:index";
const PUBLIC_CHART_PREFIX = "public-chart:";
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

function createPublicChartEntry(chart, payload) {
  const hd = chart.humanDesign || {};
  const firstName = firstNameOnly(payload.name);
  const gates = (hd.gates || chart.gates || []).slice(0, 8).map((gate) => {
    if (typeof gate === "number") {
      return { gate, line: null, tone: "" };
    }

    return {
      gate: Number(gate.gate),
      line: Number.isFinite(Number(gate.line)) ? Number(gate.line) : null,
      tone: String(gate.tone || "").slice(0, 48)
    };
  }).filter((gate) => Number.isFinite(gate.gate));

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
    gates,
    provider: chart.provider || (chart.isMock ? "Preview" : "Swiss Ephemeris"),
    isMock: Boolean(chart.isMock)
  });
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
    gates: Array.isArray(entry.gates)
      ? entry.gates.map((gate) => ({
        gate: Number(gate.gate),
        line: cleanLine(gate.line),
        tone: cleanPublicText(gate.tone, 48)
      })).filter((gate) => Number.isFinite(gate.gate)).slice(0, 8)
      : [],
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
    summary: "Diese Auswertung ist eine stabile Mock-Struktur. Die echte Human-Design-Berechnung wird hier spaeter ueber Geocoding, Zeitzone und Ephemeris-Logik angebunden.",
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

  if (!response.ok && location.source === "geocoding") {
    response = await requestAstrologyChart(apiBaseUrl, endpoint, apiKey, createAstrologyApiPayload(payload, location, false));
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Astrology API failed with status ${response.status}: ${errorBody.slice(0, 240)}`);
  }

  const data = await response.json();
  const designDate = calculateDesignDate(payload, location);
  let designData = null;
  let designRequestBody = null;

  if (env?.HUMAN_DESIGN_DESIGN_CHART !== "false") {
    designRequestBody = createAstrologyApiPayloadFromDateParts(designDate.localParts, location, true, payload.name || "MyHumanos Design");
    const designResponse = await requestAstrologyChart(apiBaseUrl, endpoint, apiKey, designRequestBody);

    if (designResponse.ok) {
      designData = await designResponse.json();
    }
  }

  let transitData = null;
  let transitRequestBody = null;

  if (env?.HUMAN_DESIGN_TRANSITS === "true" || payload.includeTransits === true || payload.includeTransits === "true") {
    const transitDate = utcDateToLocalParts(new Date(), location.timezone);
    transitRequestBody = createAstrologyApiPayloadFromDateParts(transitDate, location, true, "MyHumanos Transit");
    const transitResponse = await requestAstrologyChart(apiBaseUrl, endpoint, apiKey, transitRequestBody);

    if (transitResponse.ok) {
      transitData = await transitResponse.json();
    }
  }

  return normalizeEphemerisResponse(data, payload, requestBody, location, {
    designData,
    designRequestBody,
    designDate,
    transitData,
    transitRequestBody
  });
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
    payload.name || "MyHumanos",
    payload.houseSystem,
    payload.zodiacType
  );
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
      { label: "Autoritaet", value: humanDesign.authority },
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
      calculation: "approx_88_solar_degrees"
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
  const personalityActivations = createActivations(points, "Personality");
  const designActivations = createDesignActivations(points, designPoints);
  const activations = [...personalityActivations, ...designActivations];
  const transitActivations = createActivations(transitPoints, "Transit");
  const activeBodygraphActivations = activations.length ? activations : personalityActivations;
  const personalitySun = personalityActivations.find((activation) => activation.planet === "Sun") || personalityActivations[0];
  const designSun = designActivations.find((activation) => activation.planet === "Sun") || null;
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
        ? "Profil = Personality-Sonnenlinie / Design-Sonnenlinie. Die Design-Sonne wird aus dem 88-Grad-Sonnenbogen abgeleitet."
        : "Profil unvollstaendig: Fuer die zweite Profilzahl fehlt die Design-Sonne.",
      "Typ, Zentren und Autoritaet werden aus vollstaendig definierten Kanaelen abgeleitet."
    ],
    summary: designSun
      ? `${type} mit ${authority}-Autoritaet und Profil ${profile}. Personality und Design werden getrennt gelesen; definierte Zentren entstehen nur dort, wo komplette Kanaele aktiviert sind.`
      : `${type} mit ${authority}-Autoritaet. Die erste Profilzahl kommt aus der Personality-Sonne; die zweite braucht den Design-Zeitpunkt, etwa 88 Sonnenbogen-Grad vor der Geburt.`
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

function createTransitSummary(transitPoints, humanDesign) {
  const transitActivations = createActivations(transitPoints, "Transit");

  if (!transitActivations.length) {
    return {
      enabled: false,
      generatedAt: null,
      gates: [],
      channels: [],
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
    summary: transitChannels.length
      ? `Heute beruehren die Transite ${gates.length} Tore und oeffnen ${transitChannels.length} temporaere Kanal-Themen.`
      : `Heute beruehren die Transite ${gates.length} Tore, ohne einen neuen kompletten Kanal zu bilden.`
  };
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
  const localParts = utcDateToLocalParts(designUtc, location.timezone);

  return {
    utcTime: designUtc.toISOString(),
    localTime: `${String(localParts.year).padStart(4, "0")}-${String(localParts.month).padStart(2, "0")}-${String(localParts.day).padStart(2, "0")} ${String(localParts.hour).padStart(2, "0")}:${String(localParts.minute).padStart(2, "0")} ${location.timezone}`,
    localParts
  };
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
  const raveMandalaStart = 301.875;
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
    5: "Rhythmus", 6: "emotionale Grenzen", 7: "Fuehrung", 8: "Beitrag", 9: "Fokus",
    10: "Selbstliebe", 11: "Ideen", 12: "Stimmung und Ausdruck", 13: "Zuhören",
    14: "Ressourcen", 15: "Extreme", 16: "Talent", 17: "Meinung", 18: "Korrektur",
    19: "Beduerfnisse", 20: "Jetzt-Ausdruck", 21: "Kontrolle", 22: "Anmut", 23: "Vereinfachung",
    24: "Rueckkehr", 25: "Unschuld", 26: "Einfluss", 27: "Fuersorge", 28: "Sinnsuche",
    29: "Commitment", 30: "Verlangen", 31: "Einfluss", 32: "Beständigkeit", 33: "Rueckzug",
    34: "Power", 35: "Erfahrung", 36: "Krise und Wachstum", 37: "Gemeinschaft", 38: "Kampfgeist",
    39: "Provokation", 40: "Alleinsein", 41: "Startimpuls", 42: "Wachstum", 43: "Durchbruch",
    44: "Mustererkennung", 45: "Ressourcenfuehrung", 46: "Koerperliebe", 47: "Sinnfindung",
    48: "Tiefe", 49: "Prinzipien", 50: "Werte", 51: "Initiation", 52: "Stillstand",
    53: "Beginn", 54: "Ambition", 55: "Spirit", 56: "Storytelling", 57: "Intuition",
    58: "Lebensfreude", 59: "Intimität", 60: "Limitierung", 61: "innere Wahrheit",
    62: "Details", 63: "Zweifel", 64: "Verwirrung"
  };

  tones[13] = "Zuhoeren";
  tones[32] = "Bestaendigkeit";
  tones[59] = "Intimitaet";

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
  return channels.length ? "Keine innere Autoritaet erkannt" : "Lunar";
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
    Reflektor: "Enttaeuschung"
  }[type] || "Widerstand";
}

function signatureForType(type) {
  return {
    Generator: "Zufriedenheit",
    "Manifestierender Generator": "Zufriedenheit",
    Projektor: "Erfolg",
    Manifestor: "Frieden",
    Reflektor: "Ueberraschung"
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
