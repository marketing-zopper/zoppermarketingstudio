// Minimal Supabase (PostgREST) client for the Croma Feedback Dashboard.
// Server-only: uses the secret / service-role key, which must never reach the browser.
// Set FORM_SUPABASE_URL and FORM_SUPABASE_SERVICE_ROLE_KEY in Vercel -> Project -> Environment Variables.

export class FeedbackUnavailable extends Error {}

function config() {
  const url = (process.env.FORM_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.FORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new FeedbackUnavailable("Feedback storage is not configured.");
  return { url, key };
}

// Calls a Postgres function (the dashboard's queries live in supabase/migrations/*croma_feedback_dashboard.sql).
export async function rpc(name, args = {}) {
  const { url, key } = config();
  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: key,
        // New-style "sb_secret_..." keys are not JWTs and go in `apikey` only.
        ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new FeedbackUnavailable("Feedback storage is unreachable.");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    console.error(`Supabase rpc ${name} failed: ${res.status} ${text.slice(0, 300)}`);
    throw new FeedbackUnavailable("Feedback storage returned an error.");
  }
  return data;
}
