import { onRequestGet, onRequestOptions, onRequestPost } from "../functions/api/chart.js";
import { onAuthRequest } from "../functions/api/auth.js";
import { onCacheTestRequest } from "../functions/api/cache-test.js";
import { onGeoRequest } from "../functions/api/geo.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Überprüfe, ob die Anfrage HTTPS umleiten soll
    if (shouldRedirectToHttps(request, url)) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    // Verarbeite Chart-API-Anfragen
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

    if (url.pathname === "/api/cache-test") {
      return onCacheTestRequest({ request, env, ctx });
    }

    if (url.pathname === "/api/geo") {
      return onGeoRequest({ request, env, ctx });
    }

    // Verarbeite Auth-API-Anfragen
    if (url.pathname.startsWith("/api/auth/")) {
      return onAuthRequest({ request, env, ctx });
    }

    // Verarbeite Chart-Daten-API-Anfragen
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

    // Bereitstelle statische Assets
    return env.ASSETS.fetch(request);
  }
};

// Funktion zur Überprüfung, ob die Anfrage HTTPS umleiten soll
function shouldRedirectToHttps(request, url) {
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    return false;
  }

  if (url.protocol === "http:") {
    return true;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto === "http") {
    return true;
  }

  const cfVisitor = request.headers.get("cf-visitor");
  if (!cfVisitor) {
    return false;
  }

  try {
    return JSON.parse(cfVisitor).scheme === "http";
  } catch {
    return false;
  }
}
