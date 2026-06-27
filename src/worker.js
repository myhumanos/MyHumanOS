import { onRequestGet, onRequestOptions, onRequestPost } from "../functions/api/chart.js";
import { onRequestGet as onRequestCacheTestGet, onRequestOptions as onRequestCacheTestOptions } from "../functions/api/cache-test.js";
import { onRequestGet as onRequestGeoGet, onRequestOptions as onRequestGeoOptions } from "../functions/api/geo.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/cache-test") {
      if (request.method === "GET") {
        return onRequestCacheTestGet({ request, env, ctx });
      }
      if (request.method === "OPTIONS") {
        return onRequestCacheTestOptions({ request, env, ctx });
      }
      return new Response(JSON.stringify({ error: "Method not allowed." }), {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Allow: "GET, OPTIONS"
        }
      });
    }

    if (url.pathname === "/api/geo") {
      if (request.method === "GET") {
        return onRequestGeoGet({ request, env, ctx });
      }
      if (request.method === "OPTIONS") {
        return onRequestGeoOptions({ request, env, ctx });
      }
      return new Response(JSON.stringify({ error: "Method not allowed." }), {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Allow: "GET, OPTIONS"
        }
      });
    }

    if (url.pathname === "/api/chart") {
      if (request.method === "POST") {
        return onRequestPost({ request, env, ctx });
      }

      if (request.method === "OPTIONS") {
        return onRequestOptions({ request, env, ctx });
      }

      return new Response(JSON.stringify({ error: "Method not allowed." }), {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Allow: "POST, OPTIONS"
        }
      });
    }

    if (url.pathname === "/api/charts") {
      if (request.method === "GET") {
        return onRequestGet({ request, env, ctx });
      }

      if (request.method === "OPTIONS") {
        return onRequestOptions({ request, env, ctx });
      }

      return new Response(JSON.stringify({ error: "Method not allowed." }), {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Allow: "GET, OPTIONS"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};