// Role resolution + enforcement for the Croma Feedback Dashboard.
// The role always comes from a FRESH Upstash read (via the route guard) — never from the browser.
//
//   super_admin  marketingext@zopper.com only (not assignable): everything, incl. enabling Editor in the Admin Portal
//   admin        view + comment + archive/restore + the Archived tab
//   editor       reserved: while enabled it has Viewer capabilities only; while disabled it has no access
//   viewer       view, search, filter, sort, comment
//   none         default for every unassigned employee: no access
import { ADMIN_EMAIL } from "./auth.js";
import { getSettings } from "./store.js";
import { route, send } from "./http.js";
import { FeedbackUnavailable } from "./supabase.js";

export const FEEDBACK_TOOL_ID = "croma-feedback-dashboard";

const CAPS = {
  none: [],
  viewer: ["view", "comment"],
  editor: ["view", "comment"],
  admin: ["view", "comment", "archive"],
  super_admin: ["view", "comment", "archive"],
};

export const can = (role, cap) => CAPS[role]?.includes(cap) === true;

export async function resolveFeedbackRole(user) {
  if (user.email === ADMIN_EMAIL) return "super_admin";
  const stored = user.employee?.toolRoles?.[FEEDBACK_TOOL_ID] || "none";
  if (stored === "editor") {
    const settings = await getSettings();
    return settings[FEEDBACK_TOOL_ID]?.editorEnabled === true ? "editor" : "none";
  }
  return stored in CAPS && stored !== "super_admin" ? stored : "none";
}

// cap: one capability for every method, or a map { GET: "view", POST: "comment", PATCH: "archive" }.
// A method missing from the map is refused.
export function feedbackRoute({ methods, cap }, handler) {
  return route({ methods, access: "user" }, async (req, res, user) => {
    const needed = typeof cap === "string" ? cap : cap[req.method];
    const role = await resolveFeedbackRole(user);
    if (!needed || !can(role, needed)) {
      return send(res, 403, { error: "Access not allowed.", code: "no_feedback_access" });
    }
    try {
      await handler(req, res, { user, role });
    } catch (err) {
      if (err instanceof FeedbackUnavailable) return send(res, 503, { error: err.message });
      throw err;
    }
  });
}
