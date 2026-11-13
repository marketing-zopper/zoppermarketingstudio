// Role resolution + enforcement for the Croma Feedback Dashboard.
// The role always comes from a FRESH Upstash read (via the route guard) — never from the browser.
// It uses the standard roles (shared/rbac.js); what each may do is defined in shared/toolsMeta.js:
//
//   super_admin  marketingext@zopper.com only (not assignable): everything
//   admin        view + comment + archive/restore + the Archived tab
//   editor       disabled by default; while enabled it has Viewer capabilities only; while disabled: no access
//   viewer       view, search, filter, sort, comment
//   no_access    default for every unassigned employee: no access
import { resolveToolRole } from "./access.js";
import { route, send } from "./http.js";
import { FeedbackUnavailable } from "./supabase.js";
import { can as canDo } from "../../shared/rbac.js";

export const FEEDBACK_TOOL_ID = "croma-feedback-dashboard";

export const can = (role, cap) => canDo(FEEDBACK_TOOL_ID, role, cap);

export const resolveFeedbackRole = (user) => resolveToolRole(user, FEEDBACK_TOOL_ID);

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
