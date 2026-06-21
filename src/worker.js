import { onRequestGet, onRequestOptions, onRequestPost } from "../functions/api/chart.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
