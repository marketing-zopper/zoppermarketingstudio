import { send } from "../_lib/http.js";
import { feedbackRoute, can } from "../_lib/feedbackAccess.js";
import { rpc } from "../_lib/supabase.js";

const SORTS = ["newest", "oldest", "rating_high", "rating_low"];
const PAGE_SIZES = [10, 20, 50];
const DAY = 24 * 60 * 60 * 1000;
const IST = "+05:30"; // Croma teams work in India: date filters are whole IST days

// "YYYY-MM-DD" -> epoch ms of that IST midnight, or null when it isn't a real date.
function istDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00${IST}`);
  return Number.isNaN(t) || new Date(t + 5.5 * 3600 * 1000).toISOString().slice(0, 10) !== value ? null : t;
}

// GET /api/feedback-dashboard/items?tab=active|archived&q&store&state&rating&from&to&sort&page&pageSize
// Metrics always describe the active (non-archived) feedback; the table follows the filters.
export default feedbackRoute({ methods: ["GET"], cap: "view" }, async (req, res, { role }) => {
  const url = new URL(req.url, "http://localhost");
  const p = (k) => (url.searchParams.get(k) ?? "").trim();

  const tab = p("tab") || "active";
  if (tab !== "active" && tab !== "archived") return send(res, 400, { error: "Invalid tab." });
  // Archived feedback is invisible to anyone without archive rights — also through the API.
  if (tab === "archived" && !can(role, "archive")) {
    return send(res, 403, { error: "Access not allowed.", code: "no_feedback_access" });
  }

  const store = p("store");
  if (store && !/^A\d{3}$/.test(store)) return send(res, 400, { error: "Invalid store." });
  const state = p("state").slice(0, 80);
  const rating = p("rating");
  if (rating && !/^[1-5]$/.test(rating)) return send(res, 400, { error: "Invalid rating." });
  const sort = p("sort") || "newest";
  if (!SORTS.includes(sort)) return send(res, 400, { error: "Invalid sort." });
  const pageSize = PAGE_SIZES.includes(Number(p("pageSize"))) ? Number(p("pageSize")) : 20;
  const page = Math.min(Math.max(parseInt(p("page"), 10) || 1, 1), 100000);

  let from = null;
  let to = null;
  if (p("from")) {
    from = istDay(p("from"));
    if (from === null) return send(res, 400, { error: "Invalid From date." });
  }
  if (p("to")) {
    to = istDay(p("to"));
    if (to === null) return send(res, 400, { error: "Invalid To date." });
    to += DAY; // inclusive end date -> exclusive bound
  }
  if (from !== null && to !== null && from >= to) return send(res, 400, { error: "From date is after To date." });

  const [list, summary] = await Promise.all([
    rpc("croma_feedback_list", {
      p_archived: tab === "archived",
      p_q: p("q").slice(0, 100) || null,
      p_store: store || null,
      p_state: state || null,
      p_rating: rating ? Number(rating) : null,
      p_from: from === null ? null : new Date(from).toISOString(),
      p_to: to === null ? null : new Date(to).toISOString(),
      p_sort: sort,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    }),
    rpc("croma_feedback_summary"),
  ]);

  send(res, 200, {
    role,
    canComment: can(role, "comment"),
    canArchive: can(role, "archive"),
    tab,
    page,
    pageSize,
    total: list.total,
    items: list.items,
    metrics: { total: summary.total, average: summary.average, stores: summary.stores, archived: summary.archived },
    filters: { stores: summary.storeOptions, states: summary.stateOptions },
  });
});
