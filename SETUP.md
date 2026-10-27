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
