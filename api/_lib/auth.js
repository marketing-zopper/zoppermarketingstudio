// Server-side authentication primitives.
//  - zms_user  : Google-verified employee session (signed, httpOnly)
//  - zms_oauth : short-lived state for the Google OAuth round trip
import crypto from "node:crypto";

export const ADMIN_EMAIL = "marketingext@zopper.com";
export const ALLOWED_DOMAIN = "zopper.com";

const USER_COOKIE = "zms_user";
const OAUTH_COOKIE = "zms_oauth";
const USER_SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days; approval is re-checked on every request
const OAUTH_SECONDS = 60 * 10;

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters).");
  return s;
}

const sign = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

function pack(data, seconds) {
  const payload = b64u(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + seconds }));
  return `${payload}.${sign(payload)}`;
}

function unpack(token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return raw ? raw.slice(name.length + 1) : null;
}

function cookieString(name, value, maxAge, sameSite) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}

// ---------- user session (Google) ----------
// Lax (not Strict): the cookie is set on the redirect back from Google.
export const createUserCookie = (email) =>
  cookieString(USER_COOKIE, pack({ email }, USER_SESSION_SECONDS), USER_SESSION_SECONDS, "Lax");
export const clearUserCookie = () => cookieString(USER_COOKIE, "", 0, "Lax");

export function getUserSession(req) {
  const data = unpack(readCookie(req, USER_COOKIE));
  const email = typeof data?.email === "string" ? data.email.toLowerCase() : "";
  return email.endsWith(`@${ALLOWED_DOMAIN}`) ? { email } : null;
}

// ---------- OAuth round-trip state ----------
export const createOauthCookie = (state) =>
  cookieString(OAUTH_COOKIE, pack(state, OAUTH_SECONDS), OAUTH_SECONDS, "Lax");
export const clearOauthCookie = () => cookieString(OAUTH_COOKIE, "", 0, "Lax");
export const getOauthState = (req) => unpack(readCookie(req, OAUTH_COOKIE));
