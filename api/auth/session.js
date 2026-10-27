import { resolveUser } from "../_lib/access.js";
import { route, send } from "../_lib/http.js";

// Fresh server-side answer to "who am I and am I allowed in?" — used by every protected page.
export default route({ methods: ["GET"], access: "public" }, async (req, res) => {
  const user = await resolveUser(req);
  if (user.state === "signed_out") return send(res, 401, { status: "signed_out" });
  if (user.state === "denied") return send(res, 403, { status: "denied", email: user.email, reason: user.reason });
  send(res, 200, {
    status: "ok",
    email: user.email,
    isAdmin: user.isAdmin,
  });
});
