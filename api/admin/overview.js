import { route, send } from "../_lib/http.js";
import { listEmployees, listLogs } from "../_lib/store.js";
import { TOOLS_META } from "../../shared/toolsMeta.js";

export default route({ methods: ["GET"] }, async (req, res) => {
  const employees = await listEmployees();
  const active = employees.filter((e) => e.active).length;
  const logs = await listLogs(200);
  send(res, 200, {
    totalEmployees: employees.length,
    activeEmployees: active,
    inactiveEmployees: employees.length - active,
    totalTools: TOOLS_META.length,
    recentPermissionChanges: logs
      .filter((l) => ["permission_granted", "permission_revoked", "role_changed", "role_reviewed"].includes(l.type))
      .slice(0, 5),
  });
});
