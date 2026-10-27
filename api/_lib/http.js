import { resolveUser } from "./access.js";
import { StoreUnavailable } from "./store.js";

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function redirect(res, location, cookies = []) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end();
}

// access:
//   "public" — no checks (handler does its own)
//   "user"   — Google-verified AND approved in Redis (fresh lookup)
//   "admin"  — "user" + exactly the administrator email (verified via Google)
export function route({ methods, access = "admin" }, handler) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader("Allow", methods.join(", "));
        return send(res, 405, { error: "Method not allowed" });
      }
      if (req.method !== "GET") {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) {
          return send(res, 403, { error: "Cross-origin request blocked" });
        }
      }

      let ctx = null;
      if (access !== "public") {
        const user = await resolveUser(req);
        if (user.state === "signed_out") return send(res, 401, { error: "Please sign in.", code: "signed_out" });
        if (user.state === "denied") return send(res, 403, { error: "Access not allowed.", code: "denied" });
        if (access === "admin") {
          if (!user.isAdmin) return send(res, 403, { error: "Access not allowed.", code: "forbidden" });
        }
        ctx = user;
      }
      await handler(req, res, ctx);
    } catch (err) {
      if (err instanceof StoreUnavailable) return send(res, 503, { error: err.message });
      console.error(err);
      send(res, 500, { error: "Something went wrong. Please try again." });
    }
  };
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    return {};
  }
}

export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

// Public origin of this deployment (APP_URL pins it; otherwise derived from the request).
export function appOrigin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || (process.env.VERCEL ? "https" : "http");
  return `${String(proto).split(",")[0]}://${req.headers.host}`;
}
