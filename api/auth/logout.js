import { clearUserCookie } from "../_lib/auth.js";
import { route, send } from "../_lib/http.js";

// Ends the Google session.
export default route({ methods: ["POST"], access: "public" }, async (req, res) => {
  res.setHeader("Set-Cookie", clearUserCookie());
  send(res, 200, { ok: true });
});
