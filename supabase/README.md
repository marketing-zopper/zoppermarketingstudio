# QR Feedback Form — Supabase

Backs the public page `/feedbackform` (Croma × Zopper Feedback Desk). Upstash Redis (employees / Admin Portal) is untouched.

## Environment variables
Set in **Vercel → Project → Settings → Environment Variables** (and `.env.local` locally). See `.env.example`.

| Variable | Purpose |
|---|---|
| `FORM_SUPABASE_URL` | Project URL, e.g. `https://<project-ref>.supabase.co` |
| `FORM_SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`; the legacy `service_role` key also works). **Server-only — never put it in client code.** |
| `FEEDBACK_IP_SALT` *(optional)* | Salt for the IP hash used by rate limiting (falls back to `SESSION_SECRET`) |

The browser never talks to Supabase (the publishable/anon key is not used anywhere), so nothing sensitive reaches the client.

## One-time database setup
1. Run `supabase/migrations/20261102000000_croma_feedback.sql` in Supabase → SQL Editor. It is safe to re-run. It creates `croma_stores` and `croma_feedback_submissions`, indexes and constraints, enables RLS with **no public policies** and revokes table privileges from `anon` / `authenticated`.
2. Load the stores: `node scripts/seed-croma-stores.mjs` — reads `supabase/seed/croma_stores.json`, idempotent. Add `--deactivate-missing` to retire stores that are no longer in the file.

## Updating the store list
```
node scripts/build-croma-stores.mjs "<path>/Croma_Store_Addresses.xlsx"   # regenerates the seed JSON
node scripts/seed-croma-stores.mjs                                        # upserts it
```
`Total` is the canonical sheet; `Where we can Deliver` / `Direct to Store` only provide `store_category`. Internal columns (POC, contact number, email, sales team address) are never read.

## Reading responses
Supabase → Table Editor → `croma_feedback_submissions` (join to `croma_stores` on `store_id`). There is no in-app reporting UI yet.

## Protections in place
Server-side validation (shared rules with the form) · store must exist and be active (FK too) · DB check constraints · per-key idempotency (double click / retry never duplicates) · 10-minute duplicate-content guard · 20 submissions/hour per salted IP hash · 16 KB body limit · same-origin check · hidden honeypot field · no phone numbers or feedback text in logs.
