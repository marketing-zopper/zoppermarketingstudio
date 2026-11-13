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
Add an entry to `shared/toolsMeta.js` (set `defaults` for which optional roles start enabled) and an icon to `src/tools.jsx`. It appears on the Employee Dashboard and as a new role selector in **Employees and Access Control**.

## Roles and access control (Admin Portal → Employees and Access Control)
One screen manages employees **and** their access. Each employee row has a role dropdown per tool, right beside the employee — pick a role and it saves immediately. **Add Employee** opens a form with the profile and one role per tool, saved together in a single write; **Edit** opens the same form for name, status and several changes at once. Every tool uses the same four roles, lowest to highest: **No Access → Viewer → Editor → Admin**. No Access is the default for every new employee and every tool. `marketingext@zopper.com` (Global Super Admin) is not a role: it always has full access and is the only account that can open the Admin Portal.

**Role availability** (same screen, below the directory) lets the Global Super Admin switch the optional roles (Viewer, Editor) on or off per tool; No Access and Admin are always available. A switched-off role stays visible but disabled in the forms, can't be newly assigned, and gives no access until it is switched back on (assignments are kept). Defaults: Design Request — Viewer off; Croma Feedback Dashboard — Editor off; everything else on. Stored in Upstash (`zms:settings`) and enforced on the server.

Tool access is checked on the server **when a card is clicked** (fresh Redis lookup, identity from the signed session): No Access, a switched-off role, an inactive or unregistered employee all get the "Access Not Allowed" dialog without navigating. The tools are separate deployments with their own logins, so this does **not** stop someone who already knows a tool's direct URL from opening it. That needs integration inside each tool in a later phase — see [docs/RBAC_INTEGRATION_CONTRACT.md](docs/RBAC_INTEGRATION_CONTRACT.md) for the exact Upstash keys, role values and access-check rules those tools should follow.

### Migrating existing employee records (one time, after deploying)
Records written before this schema have Yes/No permissions. The app reads them correctly as they are, but run the migration so every record carries the new `roles` field:

```
node scripts/migrate-rbac.mjs                   # dry run — prints exactly what would change, writes nothing
node scripts/migrate-rbac.mjs --apply           # backs up first, then converts only what needs it (idempotent)
node scripts/migrate-rbac.mjs --rollback <id>   # restores the records saved in that backup
```

It needs the Upstash variables (from the environment or `.env.local`). Run it **after** the new build is live (an older build wouldn't keep `roles` up to date). `--apply` stores the backup in Upstash (`zms:backup:<id>`) and in `.data/backups/<id>.json`, keeps every existing field, keeps the old `permissions` / `toolRoles` fields in sync, and writes one `rbac_migrated` audit entry. A legacy **Yes** becomes the *lowest* role available by default (Viewer; Editor for Design Request, where Viewer is off), is never raised to Admin, and is flagged **Review** in the directory until an admin saves that employee (saving confirms the roles). `--rollback` restores the saved records; employees added after the backup and the settings are not touched.

Rolling the *code* back is also safe: the old `permissions` / `toolRoles` fields are re-derived from `roles` on every save. (Caveat: the old build ignores the role-availability switches, so a role that was switched off would count as access again.)

## Croma Feedback Form (separate app)
The Croma × Zopper QR feedback form is **not part of this app any more**. It is its own deployment at https://cromafeedbackform.vercel.app/ (own repo, own Supabase backend and environment variables). The Employee Dashboard card "Croma Feedback Form" opens it in a new tab.

The old `/feedbackform` path on this site no longer leads to the form (it is treated like any unknown route: signed-out visitors land on the login page).

## Croma Feedback Dashboard (`/croma-feedback-dashboard`)
Internal, login-protected page for reviewing the feedback the standalone form collects. It lives in this app and reads the **same Supabase project** as the form, through server-only APIs (`api/feedback-dashboard/*`); the browser never talks to Supabase.

**Environment variables (Vercel → Project → Settings → Environment Variables):** `FORM_SUPABASE_URL` and `FORM_SUPABASE_SERVICE_ROLE_KEY` (Supabase secret key). Server-side only. Redeploy after setting them.

**One-time database step:** in the Supabase SQL editor, run these two files **in order**: [20261111000000_croma_feedback_dashboard.sql](supabase/migrations/20261111000000_croma_feedback_dashboard.sql), then [20261112000000_croma_feedback_comment_delete.sql](supabase/migrations/20261112000000_croma_feedback_comment_delete.sql). They only *add* three tables (comments, archive state, archive audit trail), two columns and the query functions; they never change the form's tables or data, and they are safe to re-run (always in that order).

**Access is a per-employee role** (Admin Portal → Employees and Access Control), stored in Redis on the employee record (`roles["croma-feedback-dashboard"]`) and enforced by the server on every request:

| Role | Can do |
|---|---|
| No Access (default) | nothing — the card shows "Access Not Allowed" and every API refuses |
| Viewer | view, search, filter, sort, comment |
| Editor | disabled by default: only selectable after the Global Super Admin enables it in Role availability; while enabled it has Viewer abilities only; while disabled it has no access |
| Admin | Viewer + archive / restore + the Archived tab |
| Global Super Admin | `marketingext@zopper.com` only (not assignable): everything, plus Role availability in the Admin Portal |

Archive is not deletion: feedback and comments are kept and can be restored. Archived feedback is invisible to every role except Admin / Global Super Admin, including through the API. A comment's author is always the signed-in employee, and comments can't be edited.

**Deleting a submission from the Supabase table editor:** run [20261113000000_croma_feedback_allow_submission_delete.sql](supabase/migrations/20261113000000_croma_feedback_allow_submission_delete.sql) (after the two above). Deleting a submission then also removes its dashboard comments and archive records. Comments and archive events still can't be edited or deleted on their own.

**Deleting a comment:** only its author, or an Admin / Global Super Admin, can delete it (a Viewer or Editor can delete only their own, and only while they still have access). Deletion is a *soft* delete: the comment disappears from the dashboard and the counts, but the row stays in Supabase with who deleted it and when, and the database refuses any edit to the text.
