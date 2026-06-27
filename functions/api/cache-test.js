export async function onRequestGet(context) {
  const env = context.env;

  if (!env?.MYHUMANOS_CACHE) {
    return json({
      ok: false,
      cacheWorking: false,
      error: "MYHUMANOS_CACHE binding missing. Please add the KV namespace to wrangler.toml."
    }, 503);
  }

  const now = new Date().toISOString();
  const testValue = { ok: true, source: "myhumanos", time: now };
  const testKey = "test:hello";

  try {
    await env.MYHUMANOS_CACHE.put(testKey, JSON.stringify(testValue));
    const readBack = await env.MYHUMANOS_CACHE.get(testKey);
    const parsed = readBack ? JSON.parse(readBack) : null;

    return json({
      ok: true,
      cacheWorking: true,
      value: parsed || testValue
    });
  } catch (error) {
    return json({
      ok: false,
      cacheWorking: false,
      error: String(error?.message || error)
    }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
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
