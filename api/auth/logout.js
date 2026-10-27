import { clearSessionCookie, clearUserCookie } from "../_lib/auth.js";
import { route, send } from "../_lib/http.js";

// Ends both the Google session and the admin password session.
export default route({ methods: ["POST"], access: "public" }, async (req, res) => {
  res.setHeader("Set-Cookie", [clearUserCookie(), clearSessionCookie()]);
  send(res, 200, { ok: true });
});
