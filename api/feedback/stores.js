import { route, send } from "../_lib/http.js";
import { sb, FeedbackUnavailable } from "../_lib/supabase.js";

// PUBLIC (no Google login): the Croma store list that powers the feedback form's search box.
// Only safe public fields leave the server; the workbook's internal contact columns are never
// stored in the database in the first place.
export default route({ methods: ["GET"], access: "public" }, async (req, res) => {
  try {
    const r = await sb("croma_stores?select=store_id,store_name,state,store_address&is_active=eq.true&order=store_name.asc", {
      range: "0-4999",
    });
    if (!r.ok || !Array.isArray(r.data)) throw new FeedbackUnavailable("Could not load stores.");

    const stores = r.data.map((s) => ({ id: s.store_id, name: s.store_name, state: s.state, address: s.store_address }));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    // The list changes rarely; let the CDN and browsers reuse it briefly.
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
    res.end(JSON.stringify({ stores }));
  } catch (err) {
    if (err instanceof FeedbackUnavailable) return send(res, 503, { error: "The store list is temporarily unavailable. Please try again in a moment." });
    throw err;
  }
});
