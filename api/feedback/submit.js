import crypto from "node:crypto";
import { route, send, clientIp } from "../_lib/http.js";
import { sb, FeedbackUnavailable } from "../_lib/supabase.js";
import { validateFeedback } from "../../shared/feedbackRules.js";

// PUBLIC (no Google login): saves one piece of Croma store feedback.
// Everything is validated here again; the browser checks are only for convenience.

const MAX_BODY_BYTES = 16 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOURLY_LIMIT_PER_IP = 20; // stores share Wi-Fi, so keep this generous
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

async function readLimitedJson(req) {
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) return { tooLarge: true };
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body).length > MAX_BODY_BYTES ? { tooLarge: true } : { body: req.body };
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) return { tooLarge: true };
    chunks.push(c);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString() || "{}") };
  } catch {
    return { body: null };
  }
}

const ipHash = (req) =>
  crypto
    .createHmac("sha256", process.env.FEEDBACK_IP_SALT || process.env.SESSION_SECRET || "zms-feedback")
    .update(clientIp(req))
    .digest("hex")
    .slice(0, 32);

export default route({ methods: ["POST"], access: "public" }, async (req, res) => {
  try {
    const { body, tooLarge } = await readLimitedJson(req);
    if (tooLarge) return send(res, 413, { error: "That submission is too large." });
    if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { error: "Invalid request." });

    // Honeypot: real people never fill this hidden field. Pretend success so bots learn nothing.
    if (typeof body.website === "string" && body.website.trim() !== "") return send(res, 200, { ok: true });

    const { values, errors } = validateFeedback(body);
    const key = typeof body.submissionKey === "string" && UUID_RE.test(body.submissionKey) ? body.submissionKey.toLowerCase() : null;
    if (!key) errors.form = "Please reload the page and try again.";
    if (Object.keys(errors).length) return send(res, 400, { error: "Please check the highlighted fields.", fields: errors });

    // The store must exist and be active (the foreign key is the final guard).
    const st = await sb(`croma_stores?select=store_id&store_id=eq.${encodeURIComponent(values.storeId)}&is_active=eq.true`);
    if (!st.ok) throw new FeedbackUnavailable("store lookup failed");
    if (!st.data?.length) return send(res, 400, { error: "Please check the highlighted fields.", fields: { storeId: "Please pick a store from the list." } });

    const phone = `+91${values.phone}`;
    const hash = ipHash(req);

    // Idempotency: a retry / double click carrying the same key is a success, not a second row.
    const same = await sb(`croma_feedback_submissions?select=id&idempotency_key=eq.${key}`);
    if (!same.ok) throw new FeedbackUnavailable("lookup failed");
    if (same.data?.length) return send(res, 200, { ok: true });

    // Rate limit per (salted-hash) IP.
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent = await sb(`croma_feedback_submissions?select=id&ip_hash=eq.${hash}&created_at=gte.${encodeURIComponent(since)}`, {
      prefer: "count=exact",
      range: "0-0",
    });
    if (!recent.ok) throw new FeedbackUnavailable("rate lookup failed");
    const count = Number(recent.headers.get("content-range")?.split("/")[1] || 0);
    if (count >= HOURLY_LIMIT_PER_IP) {
      res.setHeader("Retry-After", "600");
      return send(res, 429, { error: "Too many submissions from this network. Please try again a little later." });
    }

    // Same person, store and text submitted moments ago from a freshly loaded form: treat as duplicate.
    const dupSince = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const dup = await sb(
      `croma_feedback_submissions?select=id&phone_number=eq.${encodeURIComponent(phone)}&store_id=eq.${values.storeId}` +
        `&personal_feedback=eq.${encodeURIComponent(values.feedback)}&created_at=gte.${encodeURIComponent(dupSince)}`,
    );
    if (!dup.ok) throw new FeedbackUnavailable("duplicate lookup failed");
    if (dup.data?.length) return send(res, 200, { ok: true });

    const ins = await sb("croma_feedback_submissions", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        store_id: values.storeId,
        respondent_name: values.name,
        phone_number: phone,
        experience_rating: values.rating,
        personal_feedback: values.feedback,
        idempotency_key: key,
        ip_hash: hash,
      },
    });
    if (!ins.ok) {
      // 409 = lost a race with an identical key: that submission already succeeded.
      if (ins.status === 409 && String(ins.data?.message || "").includes("idempotency_key")) return send(res, 200, { ok: true });
      console.error("feedback insert failed", ins.status, ins.data?.code); // never log the content
      throw new FeedbackUnavailable("insert failed");
    }
    return send(res, 201, { ok: true });
  } catch (err) {
    if (err instanceof FeedbackUnavailable) {
      return send(res, 503, { error: "We couldn't save your feedback just now. Your answers are still here — please try again." });
    }
    throw err;
  }
});
