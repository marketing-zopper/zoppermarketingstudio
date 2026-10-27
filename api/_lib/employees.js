import { TOOLS_META } from "../../shared/toolsMeta.js";

export const TOOL_IDS = TOOLS_META.map((t) => t.id);
export const EMAIL_RE = /^[a-z0-9._%+-]+@zopper\.com$/;

// Permissions are always returned for every known tool (missing = denied).
export function normalize(emp) {
  const permissions = {};
  for (const id of TOOL_IDS) permissions[id] = emp.permissions?.[id] === true;
  return { ...emp, permissions };
}
