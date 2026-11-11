import { route, readJson, send } from "../_lib/http.js";
import { getEmployee, saveEmployee, addLog, getSettings } from "../_lib/store.js";
import { normalize, TOOL_IDS, ROLE_TOOLS } from "../_lib/employees.js";
import { TOOLS_META } from "../../shared/toolsMeta.js";

const toolTitle = (id) => TOOLS_META.find((t) => t.id === id)?.title || id;

// PATCH { email, name?, active?, permissions?: { [toolId]: boolean }, toolRoles?: { [toolId]: roleId } }
export default route({ methods: ["PATCH"] }, async (req, res, session) => {
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const current = await getEmployee(email);
  if (!current) return send(res, 404, { error: "Employee not found." });

  const next = normalize(current);
  const logs = [];
  const actor = session.email;

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (name !== (current.name || "")) {
      next.name = name;
      logs.push({ type: "employee_updated", detail: `Name changed to "${name || "(none)"}"` });
    }
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return send(res, 400, { error: "Invalid status." });
    if (body.active !== current.active) {
      next.active = body.active;
      logs.push(
        body.active
          ? { type: "employee_reactivated", detail: "Employee reactivated" }
          : { type: "employee_deactivated", detail: "Employee deactivated" }
      );
    }
  }

  if (body.permissions !== undefined) {
    const perms = body.permissions;
    if (!perms || typeof perms !== "object") return send(res, 400, { error: "Invalid permissions." });
    for (const [toolId, value] of Object.entries(perms)) {
      if (!TOOL_IDS.includes(toolId) || typeof value !== "boolean") {
        return send(res, 400, { error: `Invalid permission: ${toolId}` });
      }
      if (next.permissions[toolId] !== value) {
        next.permissions[toolId] = value;
        logs.push({
          type: value ? "permission_granted" : "permission_revoked",
          detail: `${value ? "Allowed" : "Revoked"} access to ${toolTitle(toolId)}`,
        });
      }
    }
  }

  if (body.toolRoles !== undefined) {
    const roles = body.toolRoles;
    if (!roles || typeof roles !== "object" || Array.isArray(roles)) return send(res, 400, { error: "Invalid roles." });
    for (const [toolId, roleId] of Object.entries(roles)) {
      const tool = ROLE_TOOLS.find((t) => t.id === toolId);
      const role = tool?.roles.find((r) => r.id === roleId);
      if (!tool || !role) return send(res, 400, { error: `Invalid role: ${toolId}` });
      const before = next.toolRoles[toolId];
      if (before === roleId) continue;
      // Editor is reserved: it can only be assigned while the Global Super Admin has enabled it.
      if (roleId === "editor" && (await getSettings())[toolId]?.editorEnabled !== true) {
        return send(res, 400, { error: "The Editor role is not enabled." });
      }
      next.toolRoles[toolId] = roleId;
      const label = (id) => tool.roles.find((r) => r.id === id)?.label || id;
      logs.push({ type: "role_changed", detail: `${tool.title} role: ${label(before)} → ${label(roleId)}` });
    }
  }

  if (logs.length) {
    next.updatedAt = new Date().toISOString();
    await saveEmployee(next);
    for (const l of logs) await addLog({ ...l, actor, target: email });
  }
  send(res, 200, { employee: next });
});
