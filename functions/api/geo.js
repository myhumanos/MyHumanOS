export async function onRequestGet(context) {
  const env = context.env;
  const url = new URL(context.request.url);
  const query = url.searchParams.get("q");

  if (!query || String(query).trim().length < 2) {
    return json({ ok: false, error: "Missing or too short query parameter 'q'." }, 400);
  }

  if (!env?.MYHUMANOS_CACHE) {
    return json({ ok: false, error: "MYHUMANOS_CACHE binding missing." }, 503);
  }

  const normalizedQuery = String(query).trim().toLowerCase().replace(/\s+/g, " ");
  const cacheKey = `geo:${normalizedQuery}`;

  try {
    const cached = await env.MYHUMANOS_CACHE.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return json({ ok: true, cached: true, query: normalizedQuery, results: parsed.results });
    }
  } catch (cacheError) {
    // Ignore cache read errors, continue with live search
  }

  let nominatimResults = [];
  try {
    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
    nominatimUrl.searchParams.set("q", normalizedQuery);
    nominatimUrl.searchParams.set("format", "json");
    nominatimUrl.searchParams.set("limit", "5");
    nominatimUrl.searchParams.set("accept-language", "de,en");
    nominatimUrl.searchParams.set("addressdetails", "1");

    const response = await fetch(nominatimUrl.toString(), {
      headers: {
        "User-Agent": "MyHumanOS/1.0 (https://myhumanos.de)"
      }
    });

    if (!response.ok) {
      return json({ ok: false, error: `Nominatim returned ${response.status}` }, 502);
    }

    nominatimResults = await response.json();
  } catch (error) {
    return json({ ok: false, error: `Geo search failed: ${error.message}` }, 502);
  }

  const results = nominatimResults.slice(0, 5).map((item) => {
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
    const country = addr.country || "";
    const countryCode = (addr.country_code || "").toUpperCase();
    const timezone = timezoneFromCountryCode(countryCode);

    return {
      displayName: item.display_name,
      city: city,
      country: country,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      timezone: timezone
    };
  });

  const responseBody = { ok: true, cached: false, query: normalizedQuery, results };

  try {
    await env.MYHUMANOS_CACHE.put(cacheKey, JSON.stringify(responseBody), { expirationTtl: 60 * 60 * 24 * 7 }); // 7 days
  } catch (cacheError) {
    // Ignore cache write errors
  }

  return json(responseBody);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function timezoneFromCountryCode(countryCode) {
  const zones = {
    DE: "Europe/Berlin",
    AT: "Europe/Vienna",
    CH: "Europe/Zurich",
    FR: "Europe/Paris",
    ES: "Europe/Madrid",
    IT: "Europe/Rome",
    GB: "Europe/London",
    UK: "Europe/London",
    US: "America/New_York",
    NL: "Europe/Amsterdam",
    BE: "Europe/Brussels",
    DK: "Europe/Copenhagen",
    SE: "Europe/Stockholm",
    NO: "Europe/Oslo",
    FI: "Europe/Helsinki",
    PL: "Europe/Warsaw",
    CZ: "Europe/Prague",
    SK: "Europe/Bratislava",
    HU: "Europe/Budapest",
    RO: "Europe/Bucharest",
    BG: "Europe/Sofia",
    HR: "Europe/Zagreb",
    SI: "Europe/Ljubljana",
    EE: "Europe/Tallinn",
    LV: "Europe/Riga",
    LT: "Europe/Vilnius",
    IE: "Europe/Dublin",
    PT: "Europe/Lisbon",
    GR: "Europe/Athens",
    TR: "Europe/Istanbul",
    UA: "Europe/Kyiv",
    RU: "Europe/Moscow",
    CA: "America/Toronto",
    AU: "Australia/Sydney",
    NZ: "Pacific/Auckland",
    JP: "Asia/Tokyo",
    CN: "Asia/Shanghai",
    IN: "Asia/Kolkata",
    BR: "America/Sao_Paulo",
    MX: "America/Mexico_City",
    AR: "America/Argentina/Buenos_Aires",
    CL: "America/Santiago",
    CO: "America/Bogota",
    PE: "America/Lima",
    VE: "America/Caracas",
    ZA: "Africa/Johannesburg",
    EG: "Africa/Cairo",
    NG: "Africa/Lagos",
    KE: "Africa/Nairobi",
    AE: "Asia/Dubai",
    SA: "Asia/Riyadh",
    IL: "Asia/Jerusalem",
    TH: "Asia/Bangkok",
    VN: "Asia/Ho_Chi_Minh",
    MY: "Asia/Kuala_Lumpur",
    SG: "Asia/Singapore",
    ID: "Asia/Jakarta",
    PH: "Asia/Manila",
    KR: "Asia/Seoul",
    TW: "Asia/Taipei",
    HK: "Asia/Hong_Kong",
    PK: "Asia/Karachi",
    BD: "Asia/Dhaka",
    IR: "Asia/Tehran",
    IQ: "Asia/Baghdad"
  };

  return zones[String(countryCode).toUpperCase()] || "Europe/Berlin";
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
