// Role model shared by the server and the Admin Portal UI. Pure functions, no I/O.
//
//   no_access  ->  viewer  ->  editor  ->  admin          (+ the Global Super Admin, who is not a role)
//
// Stored per employee in Upstash as employee.roles[toolId]. Anything unknown or unavailable resolves to
// "no_access" — every check fails closed.
import { TOOLS_META } from "./toolsMeta.js";

export const NO_ACCESS = "no_access";
export const SUPER_ADMIN = "super_admin"; // never stored, never assignable

export const ROLES = [
  { id: "no_access", label: "No Access" },
  { id: "viewer", label: "Viewer" },
  { id: "editor", label: "Editor" },
  { id: "admin", label: "Admin" },
];
export const ROLE_IDS = ROLES.map((r) => r.id);
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label]));

// Only these can be switched on/off (by the Global Super Admin). No Access and Admin are always available.
export const OPTIONAL_ROLES = ["viewer", "editor"];
export const ROLE_RANK = { no_access: 0, viewer: 1, editor: 2, admin: 3 };

export const TOOL_IDS = TOOLS_META.map((t) => t.id);
export const toolById = (id) => TOOLS_META.find((t) => t.id === id);

// Old role ids that may still sit in records written before this schema.
export const normalizeRoleId = (r) => (r === "none" ? NO_ACCESS : r);

// ---- availability ----
// settings: { [toolId]: { viewerEnabled?: boolean, editorEnabled?: boolean } } (Upstash `zms:settings`).
// A role with no stored setting falls back to the tool's default in toolsMeta.
export function roleAvailable(toolId, role, settings) {
  if (role === NO_ACCESS || role === "admin") return true;
  const tool = toolById(toolId);
  if (!tool || !OPTIONAL_ROLES.includes(role)) return false;
  const stored = settings?.[toolId]?.[`${role}Enabled`];
  return typeof stored === "boolean" ? stored : tool.defaults?.[role] === true;
}

export function availability(settings) {
  return Object.fromEntries(
    TOOLS_META.map((t) => [t.id, Object.fromEntries(ROLE_IDS.map((r) => [r, roleAvailable(t.id, r, settings)]))])
  );
}

// The role that actually applies: the stored one if it is valid AND currently available, else no_access.
export function effectiveRole(toolId, stored, settings) {
  const role = normalizeRoleId(stored);
  return ROLE_IDS.includes(role) && roleAvailable(toolId, role, settings) ? role : NO_ACCESS;
}

// ---- capabilities ----
// Defined for every role of every tool, so enabling a role later never grants an undefined set of powers.
const GENERIC = { viewer: ["view"], editor: ["view", "edit"], admin: ["view", "edit", "manage"] };

export function capabilitiesOf(toolId, role) {
  const effective = role === SUPER_ADMIN ? "admin" : role;
  if (!ROLE_IDS.includes(effective) || effective === NO_ACCESS) return [];
  const own = toolById(toolId)?.capabilities?.[effective] ?? GENERIC[effective];
  return ["open", ...own]; // "open" = may open the tool from the Employee Dashboard
}

export const can = (toolId, role, cap) => capabilitiesOf(toolId, role).includes(cap);
