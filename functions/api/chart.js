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
    return json(ephemerisChart);
  }

  return json(createMockChart(payload));
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
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

  return normalizeEphemerisResponse(data, payload, requestBody, location);
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
  const birthData = {
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
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
      name: payload.name || "MyHumanos",
      birth_data: birthData
    },
    options: {
      house_system: payload.houseSystem || "P",
      zodiac_type: payload.zodiacType || "Tropic",
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

function normalizeEphemerisResponse(data, payload, requestBody, location) {
  const points = extractAstrologyPoints(data);
  const sun = findPoint(points, "Sun");
  const moon = findPoint(points, "Moon");
  const ascendant = findPoint(points, "Ascendant");
  const houses = extractHouses(data);
  const humanDesign = createHumanDesignPreview(points, payload);
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

function createHumanDesignPreview(points, payload) {
  const activations = points
    .filter((point) => Number.isFinite(point.longitude))
    .map((point) => {
      const gateInfo = gateFromLongitude(point.longitude);

      return {
        planet: point.name,
        sign: point.sign,
        degree: point.degree,
        longitude: point.longitude,
        house: point.house,
        retrograde: point.retrograde,
        ...gateInfo,
        tone: gateTone(gateInfo.gate)
      };
    });
  const sun = activations.find((activation) => activation.planet === "Sun") || activations[0];
  const moon = activations.find((activation) => activation.planet === "Moon") || activations[1] || sun;
  const ascendant = activations.find((activation) => activation.planet === "Ascendant") || activations[2] || sun;
  const profile = `${sun?.line || 1}/${moon?.line || 3}`;
  const definedCenters = deriveCentersFromActivations(activations);
  const type = deriveHumanDesignType(definedCenters, activations);
  const authority = deriveAuthority(definedCenters, moon);
  const strategy = strategyForType(type);
  const notSelf = notSelfForType(type);
  const signature = signatureForType(type);
  const gates = uniqueByGate(activations).slice(0, 14);

  return {
    name: payload.name || "Dein Chart",
    type,
    strategy,
    authority,
    profile,
    signature,
    notSelf,
    definedCenters,
    openCenters: ["Kopf", "Ajna", "Kehle", "G-Zentrum", "Ego", "Milz", "Sakral", "Solarplexus", "Wurzel"].filter(
      (center) => !definedCenters.includes(center)
    ),
    gates,
    activations,
    summary: `${type} mit ${authority}-Autoritaet und Profil ${profile}. Die Tore und Linien werden aus echten Swiss-Ephemeris-Positionen berechnet; Zentren, Typ und Autoritaet sind eine MyHumanOS-Preview, bis der vollstaendige Design-Koerpergraph aktiviert ist.`
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
    25, 17, 21, 51, 42, 3, 27, 24,
    2, 23, 8, 20, 16, 35, 45, 12,
    15, 52, 39, 53, 62, 56, 31, 33,
    7, 4, 29, 59, 40, 64, 47, 6,
    46, 18, 48, 57, 32, 50, 28, 44,
    1, 43, 14, 34, 9, 5, 26, 11,
    10, 58, 38, 54, 61, 60, 41, 19,
    13, 49, 30, 55, 37, 63, 22, 36
  ];
  const normalized = (((longitude % 360) + 360) % 360);
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

function deriveCentersFromActivations(activations) {
  const centerByGate = {
    Kopf: [61, 63, 64], Ajna: [4, 11, 17, 24, 43, 47], Kehle: [8, 12, 16, 20, 23, 31, 33, 35, 45, 56, 62],
    "G-Zentrum": [1, 2, 7, 10, 13, 15, 25, 46], Ego: [21, 26, 40, 51], Milz: [18, 28, 32, 44, 48, 50, 57],
    Sakral: [3, 5, 9, 14, 27, 29, 34, 42, 59], Solarplexus: [6, 22, 30, 36, 37, 49, 55], Wurzel: [19, 38, 39, 41, 52, 53, 54, 58, 60]
  };
  const gates = activations.map((activation) => activation.gate);

  return Object.entries(centerByGate)
    .filter(([, centerGates]) => centerGates.some((gate) => gates.includes(gate)))
    .map(([center]) => center);
}

function deriveHumanDesignType(centers, activations) {
  const hasSacral = centers.includes("Sakral");
  const hasThroat = centers.includes("Kehle");
  const motorGates = [21, 26, 34, 35, 45, 12, 22, 36];
  const hasMotorToThroatHint = hasThroat && activations.some((activation) => motorGates.includes(activation.gate));

  if (centers.length <= 1) return "Reflektor";
  if (hasSacral && hasMotorToThroatHint) return "Manifestierender Generator";
  if (hasSacral) return "Generator";
  if (hasMotorToThroatHint) return "Manifestor";
  return "Projektor";
}

function deriveAuthority(centers, moon) {
  if (centers.includes("Solarplexus")) return "Emotional";
  if (centers.includes("Sakral")) return "Sakral";
  if (centers.includes("Milz")) return "Milz";
  if (centers.includes("Ego")) return "Ego";
  if (centers.includes("G-Zentrum")) return "Selbst-projiziert";
  return moon?.sign ? `lunar / ${moon.sign}` : "lunar";
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
