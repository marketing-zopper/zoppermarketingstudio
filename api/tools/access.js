import { route, readJson, send } from "../_lib/http.js";
import { TOOLS_META } from "../../shared/toolsMeta.js";

// POST { toolId } -> { allowed, url? }
// Identity comes from the server session; permissions come from a fresh Redis read
// (done by the route guard). Any failure results in a denial/error, never an open.
export default route({ methods: ["POST"], access: "user" }, async (req, res, user) => {
  const { toolId } = await readJson(req);
  const tool = TOOLS_META.find((t) => t.id === toolId);
  if (!tool) return send(res, 400, { error: "Unknown tool." });

  // Administrator without an employee record is allowed; a record is always honoured.
  const allowed = user.employee ? user.employee.permissions[tool.id] === true : user.isAdmin;
  if (!allowed) return send(res, 200, { allowed: false });
  send(res, 200, { allowed: true, url: tool.url });
});
