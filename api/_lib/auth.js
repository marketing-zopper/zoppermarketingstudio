// Server-side authentication primitives.
//  - zms_user  : Google-verified employee session (signed, httpOnly)
//  - zms_admin : admin password session, layered on top of zms_user (signed, httpOnly)
//  - zms_oauth : short-lived state for the Google OAuth round trip
import crypto from "node:crypto";

export const ADMIN_EMAIL = "marketingext@zopper.com";
export const ALLOWED_DOMAIN = "zopper.com";

const USER_COOKIE = "zms_user";
const ADMIN_COOKIE = "zms_admin";
const OAUTH_COOKIE = "zms_oauth";
const USER_SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days; approval is re-checked on every request
const ADMIN_SESSION_SECONDS = 60 * 60 * 8; // 8 hours
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

// ---------- admin password ----------
// Hash format: scrypt:<saltB64>:<hashB64>  (generate with `npm run hash-password`)
export function verifyPassword(password) {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!stored) throw new Error("ADMIN_PASSWORD_HASH is not set.");
  const [scheme, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) throw new Error("ADMIN_PASSWORD_HASH is malformed.");
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
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

// ---------- admin session (password) ----------
export const createSessionCookie = (email) =>
  cookieString(ADMIN_COOKIE, pack({ email }, ADMIN_SESSION_SECONDS), ADMIN_SESSION_SECONDS, "Strict");
export const clearSessionCookie = () => cookieString(ADMIN_COOKIE, "", 0, "Strict");

export function getSession(req) {
  const data = unpack(readCookie(req, ADMIN_COOKIE));
  return data?.email === ADMIN_EMAIL ? { email: data.email } : null;
}

// ---------- OAuth round-trip state ----------
export const createOauthCookie = (state) =>
  cookieString(OAUTH_COOKIE, pack(state, OAUTH_SECONDS), OAUTH_SECONDS, "Lax");
export const clearOauthCookie = () => cookieString(OAUTH_COOKIE, "", 0, "Lax");
export const getOauthState = (req) => unpack(readCookie(req, OAUTH_COOKIE));
