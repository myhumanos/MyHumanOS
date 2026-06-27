const USER_PREFIX = "user:v1:";
const SESSION_PREFIX = "session:v1:";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function onAuthRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.pathname.replace("/api/auth/", "");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (action === "me" && request.method === "GET") {
    const user = await currentUser(env, request);
    return json({ user: publicUser(user, env) });
  }

  if (action === "admin" && request.method === "GET") {
    const user = await currentUser(env, request);
    if (!isAdmin(env, user)) return json({ error: "Admin-Rechte fehlen." }, 403);
    const store = getStore(env);
    const users = await listUsers(store);
    return json({
      admin: publicUser(user, env),
      users,
      status: {
        storageEnabled: Boolean(store),
        astrologyKeyConfigured: Boolean(env?.ASTROLOGY_API_KEY),
        transitsEnabled: env?.HUMAN_DESIGN_TRANSITS === "true",
        designRefinementSteps: env?.HUMAN_DESIGN_DESIGN_REFINEMENT_STEPS || "1"
      }
    });
  }

  if (action === "logout" && request.method === "POST") {
    const sessionId = readSessionCookie(request);
    const store = getStore(env);
    if (store && sessionId) {
      await store.delete(`${SESSION_PREFIX}${sessionId}`);
    }
    return json({ ok: true }, 200, clearCookieHeaders());
  }

  if (action === "profile" && request.method === "GET") {
    const user = await currentUser(env, request);
    if (!user) return json({ error: "Nicht eingeloggt." }, 401);
    return json({ profile: user.profile || null });
  }

  if (action === "profile" && request.method === "POST") {
    const user = await currentUser(env, request);
    if (!user) return json({ error: "Nicht eingeloggt." }, 401);
    const body = await safeJson(request);
    user.profile = sanitizeProfile(body.profile || body);
    user.updatedAt = new Date().toISOString();
    await getStore(env).put(`${USER_PREFIX}${user.email}`, JSON.stringify(user));
    return json({ user: publicUser(user, env), profile: user.profile });
  }

  if ((action === "register" || action === "login") && request.method === "POST") {
    const store = getStore(env);
    if (!store) return json({ error: "Account-Speicher ist nicht konfiguriert." }, 503);

    const body = await safeJson(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!email || password.length < 8) {
      return json({ error: "Bitte E-Mail und Passwort mit mindestens 8 Zeichen eingeben." }, 422);
    }

    const key = `${USER_PREFIX}${email}`;
    let user = await readUser(store, key);

    if (action === "register") {
      if (user) return json({ error: "Account existiert schon. Bitte einloggen." }, 409);
      const passwordHash = await hashPassword(password);
      user = {
        id: crypto.randomUUID(),
        email,
        passwordHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        profile: null
      };
      await store.put(key, JSON.stringify(user));
    } else {
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return json({ error: "Login fehlgeschlagen." }, 401);
      }
    }

    const sessionId = crypto.randomUUID();
    await store.put(`${SESSION_PREFIX}${sessionId}`, JSON.stringify({ email, createdAt: new Date().toISOString() }), {
      expirationTtl: SESSION_MAX_AGE
    });

    return json({ user: publicUser(user, env) }, 200, sessionCookieHeaders(sessionId));
  }

  return json({ error: "Not found." }, 404);
}

async function currentUser(env, request) {
  const store = getStore(env);
  const sessionId = readSessionCookie(request);
  if (!store || !sessionId) return null;

  const session = await store.get(`${SESSION_PREFIX}${sessionId}`, "json");
  if (!session?.email) return null;
  return readUser(store, `${USER_PREFIX}${session.email}`);
}

async function readUser(store, key) {
  try {
    return await store.get(key, "json");
  } catch {
    return null;
  }
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await sha256Hex(`${hex(salt)}:${password}`);
  return `sha256:${hex(salt)}:${hash}`;
}

async function verifyPassword(password, encoded) {
  const [, saltText, hashText] = String(encoded || "").split(":");
  if (!saltText || !hashText) return false;
  return (await sha256Hex(`${saltText}:${password}`)) === hashText;
}

function sanitizeProfile(profile) {
  return {
    savedAt: new Date().toISOString(),
    name: clean(profile.name || profile.firstName || "Mein Profil", 80),
    type: clean(profile.type, 40),
    strategy: clean(profile.strategy, 80),
    authority: clean(profile.authority, 60),
    profile: clean(profile.profile, 20),
    signature: clean(profile.signature, 50),
    notSelf: clean(profile.notSelf, 50),
    birthDate: clean(profile.birthDate, 20),
    birthTime: clean(profile.birthTime, 20),
    birthPlace: clean(profile.birthPlace, 120),
    timezone: clean(profile.timezone, 80),
    centers: Array.isArray(profile.centers) ? profile.centers.slice(0, 9).map((item) => clean(item, 40)) : [],
    openCenters: Array.isArray(profile.openCenters) ? profile.openCenters.slice(0, 9).map((item) => clean(item, 40)) : [],
    gates: Array.isArray(profile.gates) ? profile.gates.slice(0, 32) : []
  };
}

async function listUsers(store) {
  if (!store?.list) return [];
  const output = await store.list({ prefix: USER_PREFIX, limit: 100 });
  const users = await Promise.all((output.keys || []).map(async (item) => {
    const user = await readUser(store, item.name);
    return user ? publicUser(user) : null;
  }));
  return users.filter(Boolean).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

function publicUser(user, env = null) {
  return user ? {
    id: user.id,
    email: user.email,
    role: user.role || "user",
    isAdmin: user.role === "admin" || isAdminEmailOnly(user.email, env?.MYHUMANOS_ADMIN_EMAILS),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    profile: user.profile || null
  } : null;
}

function isAdmin(env, user) {
  return Boolean(user && (user.role === "admin" || isAdminEmailOnly(user.email, env?.MYHUMANOS_ADMIN_EMAILS)));
}

function isAdminEmailOnly(email, adminEmails) {
  const list = String(adminEmails || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(email || "").toLowerCase());
}

function clean(value, max = 120) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function readSessionCookie(request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("mh_session="))?.slice("mh_session=".length) || "";
}

function sessionCookieHeaders(sessionId) {
  return { "Set-Cookie": `mh_session=${sessionId}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax` };
}

function clearCookieHeaders() {
  return { "Set-Cookie": "mh_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" };
}

function getStore(env) {
  return env?.PUBLIC_CHARTS || env?.MYHUMANOS_CHARTS || null;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function hex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
