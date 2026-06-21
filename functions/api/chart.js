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
  const requestBody = createAstrologyApiPayload(payload);
  const response = await fetch(new URL(endpoint, apiBaseUrl).toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Astrology API failed with status ${response.status}: ${errorBody.slice(0, 240)}`);
  }

  const data = await response.json();

  return normalizeEphemerisResponse(data, payload, requestBody);
}

function createAstrologyApiPayload(payload) {
  const [year, month, day] = payload.birthDate.split("-").map(Number);
  const [hour, minute] = payload.birthTime.split(":").map(Number);
  const place = parseBirthPlace(payload.birthPlace);

  return {
    subject: {
      name: payload.name || "MyHumanos",
      birth_data: {
        year,
        month,
        day,
        hour,
        minute,
        second: 0,
        city: place.city,
        country_code: place.countryCode
      }
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

function normalizeEphemerisResponse(data, payload, requestBody) {
  const points = extractAstrologyPoints(data);
  const sun = findPoint(points, "Sun");
  const moon = findPoint(points, "Moon");
  const ascendant = findPoint(points, "Ascendant");
  const houses = extractHouses(data);

  return {
    type: "Natal Chart",
    strategy: formatPointShort(sun) || "Sonne berechnet",
    authority: formatPointShort(moon) || "Mond berechnet",
    profile: formatPointShort(ascendant) || "Aszendent berechnet",
    centers: deriveChartHighlights(points),
    gates: deriveChartMarkers(points),
    metrics: [
      { label: "Sonne", value: formatPointShort(sun) || "n/a" },
      { label: "Mond", value: formatPointShort(moon) || "n/a" },
      { label: "Aszendent", value: formatPointShort(ascendant) || "n/a" }
    ],
    points,
    houses,
    summary: "Diese Auswertung kommt von astrology-api.io und nutzt Swiss-Ephemeris-basierte Berechnungen fuer den Natal Chart.",
    isMock: false,
    provider: "Swiss Ephemeris",
    raw: data,
    request: requestBody,
    input: {
      birthDate: payload.birthDate,
      birthTime: payload.birthTime,
      birthPlace: String(payload.birthPlace).trim()
    }
  };
}

function parseBirthPlace(value) {
  const parts = String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts[0] || String(value).trim();
  const countryInput = parts[1] || "DE";
  const countryCode = normalizeCountryCode(countryInput);

  return { city, countryCode };
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
