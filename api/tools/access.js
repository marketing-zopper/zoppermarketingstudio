import { route, readJson, send } from "../_lib/http.js";
import { resolveToolRole } from "../_lib/access.js";
import { NO_ACCESS, toolById } from "../../shared/rbac.js";

// POST { toolId } -> { allowed, url? }
// Identity comes from the server session; the employee's role and the role-availability settings come from
// fresh Redis reads. No Access, an unavailable (switched-off) role, an inactive or unregistered employee,
// or any failure results in a denial/error — never an open.
export default route({ methods: ["POST"], access: "user" }, async (req, res, user) => {
  const { toolId } = await readJson(req);
  const tool = toolById(toolId);
  if (!tool) return send(res, 400, { error: "Unknown tool." });

  const role = await resolveToolRole(user, tool.id);
  if (role === NO_ACCESS) return send(res, 200, { allowed: false });
  send(res, 200, { allowed: true, url: tool.url });
});
