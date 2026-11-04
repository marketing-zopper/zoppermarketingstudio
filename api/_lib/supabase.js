// Minimal Supabase (PostgREST) client for the QR feedback form.
// Server-only: uses the secret / service-role key, which must never reach the browser.
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel -> Project -> Environment Variables.

export class FeedbackUnavailable extends Error {}

function config() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new FeedbackUnavailable("Feedback storage is not configured.");
  return { url, key };
}

export async function sb(pathAndQuery, { method = "GET", body, prefer, range } = {}) {
  const { url, key } = config();
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: key,
        // New-style "sb_secret_..." keys are not JWTs and go in `apikey` only.
        ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
        ...(range ? { Range: range } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new FeedbackUnavailable("Feedback storage is unreachable.");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}
