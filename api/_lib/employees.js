import { TOOLS_META } from "../../shared/toolsMeta.js";

// Tools with a simple on/off permission, and tools whose access is a role.
export const TOOL_IDS = TOOLS_META.filter((t) => !t.roleBased).map((t) => t.id);
export const ROLE_TOOLS = TOOLS_META.filter((t) => t.roleBased);
export const EMAIL_RE = /^[a-z0-9._%+-]+@zopper\.com$/;

// Permissions are always returned for every known tool (missing = denied / "none").
export function normalize(emp) {
  const permissions = {};
  for (const id of TOOL_IDS) permissions[id] = emp.permissions?.[id] === true;
  const toolRoles = {};
  for (const t of ROLE_TOOLS) {
    const stored = emp.toolRoles?.[t.id];
    toolRoles[t.id] = t.roles.some((r) => r.id === stored) ? stored : "none";
  }
  return { ...emp, permissions, toolRoles };
}
