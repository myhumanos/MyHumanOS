export async function onCacheTestRequest({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "GET") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "GET, OPTIONS" });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/cache-test/probe", request.url), { method: "GET" });
  const marker = crypto.randomUUID();

  try {
    await cache.put(cacheKey, json({ marker }, 200, { "Cache-Control": "public, max-age=60" }));
    const cached = await cache.match(cacheKey);
    const body = cached ? await cached.json() : null;
    const cacheWorking = body?.marker === marker;

    return json({ ok: cacheWorking, cacheWorking }, cacheWorking ? 200 : 503, {
      "Cache-Control": "no-store"
    });
  } catch {
    return json({ ok: false, cacheWorking: false, error: "CACHE_UNAVAILABLE" }, 503, {
      "Cache-Control": "no-store"
    });
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
