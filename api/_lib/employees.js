// Employee record schema (Upstash hash `zms:employees`, one JSON value per email).
//
//   { email, name, active, createdAt, updatedAt,
//     rbacVersion: 2,
//     roles:  { [toolId]: "no_access" | "viewer" | "editor" | "admin" },   <- canonical, one entry per tool
//     review: { [toolId]: "legacy_access" | "conflict" | "invalid_role" }, <- optional: needs an admin's confirmation
//     permissions, toolRoles }                                              <- legacy mirrors, see below
//
// `permissions` (Yes/No per tool) and `toolRoles` (Croma Feedback Dashboard role) are the pre-RBAC fields.
// They are always re-derived from `roles` on every save so that rolling the code back never resurrects a
// revoked permission. Nothing outside this app writes employee records.
import { TOOLS_META } from "../../shared/toolsMeta.js";
import { NO_ACCESS, ROLE_IDS, ROLE_RANK, normalizeRoleId, toolById, roleAvailable, ROLE_LABEL } from "../../shared/rbac.js";

export const EMAIL_RE = /^[a-z0-9._%+-]+@zopper\.com$/;
export const RBAC_VERSION = 2;

// A legacy "Yes" only said "may open the tool", never at what level. It converts to the LOWEST role that is
// available by default for that tool (Viewer, or Editor where Viewer is disabled) and is flagged for review.
const legacyYesRole = (tool) => ["viewer", "editor"].find((r) => tool.defaults?.[r]) || "admin";

// Any stored shape -> { ...record fields, roles (all tools), review }. Never throws; unknown input -> no_access.
export function normalize(raw) {
  const { permissions, toolRoles, rbacVersion, roles: storedRoles, review: storedReview, ...rest } = raw;
  const isV2 = rbacVersion === RBAC_VERSION;
  // A record that claims the new schema but has no usable `roles` denies everything (it never falls back
  // to the legacy fields) and is flagged on every tool.
  const usable = isV2 && storedRoles && typeof storedRoles === "object" && !Array.isArray(storedRoles);
  const roles = {};
  const review = {};

  for (const t of TOOLS_META) {
    let role = NO_ACCESS;

    if (isV2) {
      const stored = usable ? normalizeRoleId(storedRoles[t.id]) : undefined;
      if (ROLE_IDS.includes(stored)) role = stored;
      else if (stored !== undefined || !usable) review[t.id] = "invalid_role";

      // Guard against drift: if the legacy mirror says LESS than `roles` (e.g. an older build revoked the
      // permission after this record was written), believe the lower value and flag it. Never the higher.
      const mirror = t.internal ? normalizeRoleId(toolRoles?.[t.id]) : permissions?.[t.id] === true ? role : NO_ACCESS;
      const mirrorRole = ROLE_IDS.includes(mirror) ? mirror : NO_ACCESS;
      if (ROLE_RANK[mirrorRole] < ROLE_RANK[role]) {
        role = mirrorRole;
        review[t.id] = "conflict";
      }
      if (!review[t.id] && typeof storedReview?.[t.id] === "string") review[t.id] = storedReview[t.id];
    } else if (t.internal) {
      const stored = normalizeRoleId(toolRoles?.[t.id]);
      if (ROLE_IDS.includes(stored)) role = stored;
      else if (stored !== undefined) review[t.id] = "invalid_role";
    } else if (permissions?.[t.id] === true) {
      role = legacyYesRole(t);
      review[t.id] = "legacy_access";
    }

    roles[t.id] = role;
  }
  return { ...rest, roles, review };
}

// In-memory employee -> the JSON that is stored (adds the schema marker and the legacy mirrors).
export function toRecord(emp) {
  const { review, roles, permissions: _p, toolRoles: _t, rbacVersion: _v, ...rest } = emp;
  const permissions = {};
  const toolRoles = {};
  for (const t of TOOLS_META) {
    const role = roles[t.id] ?? NO_ACCESS;
    if (t.internal) toolRoles[t.id] = role === NO_ACCESS ? "none" : role;
    else permissions[t.id] = role !== NO_ACCESS;
  }
  return {
    ...rest,
    rbacVersion: RBAC_VERSION,
    roles,
    ...(review && Object.keys(review).length ? { review } : {}),
    permissions,
    toolRoles,
  };
}

// Validates a { [toolId]: roleId } map from a request. A role that is switched off can't be newly assigned,
// but an employee who already holds it keeps it (so editing their name never fails).
// Returns { roles } with only the tools present in the input, or { error }.
export function parseRolesInput(input, settings, currentRoles = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Invalid roles." };
  const roles = {};
  for (const [toolId, role] of Object.entries(input)) {
    const tool = toolById(toolId);
    if (!tool) return { error: `Unknown tool: ${toolId}` };
    if (!ROLE_IDS.includes(role)) return { error: `Invalid role for ${tool.title}.` };
    if (role !== currentRoles[toolId] && !roleAvailable(toolId, role, settings)) {
      return { error: `The ${ROLE_LABEL[role]} role is not available for ${tool.title}.` };
    }
    roles[toolId] = role;
  }
  return { roles };
}

// Audit-log lines for a change of roles (one per tool, same wording everywhere).
export function roleChangeLogs(before, after) {
  return TOOLS_META.filter((t) => before[t.id] !== after[t.id]).map((t) => ({
    type: "role_changed",
    detail: `${t.title} role: ${ROLE_LABEL[before[t.id]]} → ${ROLE_LABEL[after[t.id]]}`,
    to: after[t.id],
  }));
}
