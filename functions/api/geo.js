export async function onGeoRequest({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "GET") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "GET, OPTIONS" });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim();

  if (!query) {
    return json({ ok: false, error: "MISSING_QUERY", message: "Query parameter q is required." }, 400);
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "de");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      return json({ ok: false, error: "GEOCODING_UNAVAILABLE", message: "Geocoding provider unavailable." }, 502);
    }

    const data = await response.json();
    return json({ ok: true, query, results: Array.isArray(data?.results) ? data.results : [] });
  } catch {
    return json({ ok: false, error: "GEOCODING_UNAVAILABLE", message: "Geocoding provider unavailable." }, 502);
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(), ...extraHeaders }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
