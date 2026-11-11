# Setup & deployment

How sign-in works: **Google login → approval check in Redis → Master Dashboard.**
An `@zopper.com` Google account is *not* enough on its own — the employee must be added (and active) in the Admin Portal. The administrator email `marketingext@zopper.com` is always approved and goes straight into the Admin Portal after Google sign-in (no separate password).

## Environment variables
Set these in **Vercel → Project → Settings → Environment Variables** (and in `.env.local` for local development — see `.env.example`).

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (see below) |
| `APP_URL` *(optional)* | Pins the public URL used for the OAuth redirect, e.g. `https://zoppermarketingstudio.vercel.app` |
| `SESSION_SECRET` | Random string of 32+ characters that signs login sessions |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis → REST API section (`KV_REST_API_URL` / `KV_REST_API_TOKEN` also accepted) |

Redeploy after changing environment variables.

## Google sign-in (one-time)
1. Google Cloud Console → **APIs & Services → OAuth consent screen**. Choose user type **Internal** (limits sign-in to the zopper.com Workspace).
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. Add **Authorized redirect URIs**:
   - `https://zoppermarketingstudio.vercel.app/api/auth/google/callback`
   - `http://localhost:5173/api/auth/google/callback` (local development)
4. Copy the client ID and secret into the environment variables above.

Locally, open the app at `http://localhost:5173` (not `127.0.0.1`) so the sign-in cookies and redirect URI match.

## Adding a new tool
Add an entry to `shared/toolsMeta.js` and an icon to `src/tools.jsx`. It appears on the Employee Dashboard and as a new permission column in the Admin Portal.

## What is and isn't enforced
Tool access is checked on the server **when a card is clicked** (fresh Redis lookup, identity from the signed session). The tools are separate deployments with their own logins, so this does **not** stop someone who already knows a tool's direct URL from opening it. That needs integration inside each tool in a later phase.

## Croma Feedback Form (separate app)
The Croma × Zopper QR feedback form is **not part of this app any more**. It is its own deployment at https://cromafeedbackform.vercel.app/ (own repo, own Supabase backend and environment variables). The Employee Dashboard card "Croma Feedback Form" opens it in a new tab.

The old `/feedbackform` path on this site no longer leads to the form (it is treated like any unknown route: signed-out visitors land on the login page).

## Croma Feedback Dashboard (`/croma-feedback-dashboard`)
Internal, login-protected page for reviewing the feedback the standalone form collects. It lives in this app and reads the **same Supabase project** as the form, through server-only APIs (`api/feedback-dashboard/*`); the browser never talks to Supabase.

**Environment variables (Vercel → Project → Settings → Environment Variables):** `FORM_SUPABASE_URL` and `FORM_SUPABASE_SERVICE_ROLE_KEY` (Supabase secret key). Server-side only. Redeploy after setting them.

**One-time database step:** in the Supabase SQL editor, run these two files **in order**: [20261111000000_croma_feedback_dashboard.sql](supabase/migrations/20261111000000_croma_feedback_dashboard.sql), then [20261112000000_croma_feedback_comment_delete.sql](supabase/migrations/20261112000000_croma_feedback_comment_delete.sql). They only *add* three tables (comments, archive state, archive audit trail), two columns and the query functions; they never change the form's tables or data, and they are safe to re-run (always in that order).

**Access is a per-employee role** (Admin Portal → Tool Access → "Croma Feedback Dashboard"), stored in Redis on the employee record (`toolRoles`) and enforced by the server on every request:

| Role | Can do |
|---|---|
| No Access (default) | nothing — the card shows "Access Not Allowed" and every API refuses |
| Viewer | view, search, filter, sort, comment |
| Editor | reserved: only selectable after the Global Super Admin enables it; while enabled it has Viewer abilities only; while disabled it has no access |
| Admin | Viewer + archive / restore + the Archived tab |
| Global Super Admin | `marketingext@zopper.com` only (not assignable): everything, plus the Editor switch in the Admin Portal |

Archive is not deletion: feedback and comments are kept and can be restored. Archived feedback is invisible to every role except Admin / Global Super Admin, including through the API. A comment's author is always the signed-in employee, and comments can't be edited.

**Deleting a comment:** only its author, or an Admin / Global Super Admin, can delete it (a Viewer or Editor can delete only their own, and only while they still have access). Deletion is a *soft* delete: the comment disappears from the dashboard and the counts, but the row stays in Supabase with who deleted it and when, and the database refuses any edit to the text.
