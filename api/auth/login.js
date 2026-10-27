import { verifyPassword, createSessionCookie } from "../_lib/auth.js";
import { resolveUser } from "../_lib/access.js";
import { route, readJson, send, clientIp } from "../_lib/http.js";
import { bumpCounter, resetCounter } from "../_lib/store.js";

const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60;

// Admin password step. Only reachable by the Google-verified administrator email;
// the email is taken from the server session, never from the request body.
export default route({ methods: ["POST"], access: "public" }, async (req, res) => {
  const user = await resolveUser(req);
  if (user.state === "signed_out") return send(res, 401, { error: "Please sign in.", code: "signed_out" });
  if (user.state !== "ok" || !user.isAdmin) return send(res, 403, { error: "Access not allowed.", code: "forbidden" });

  const key = `zms:login:${clientIp(req)}`;
  const attempts = await bumpCounter(key, WINDOW_SECONDS);
  if (attempts > MAX_ATTEMPTS) {
    return send(res, 429, { error: "Too many attempts. Please try again in 15 minutes." });
  }

  const { password } = await readJson(req);
  if (!verifyPassword(password || "")) {
    return send(res, 401, { error: "Incorrect password." });
  }

  await resetCounter(key);
  res.setHeader("Set-Cookie", createSessionCookie(user.email));
  send(res, 200, { email: user.email });
});
