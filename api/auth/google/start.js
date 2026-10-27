import crypto from "node:crypto";
import { route, redirect, appOrigin } from "../../_lib/http.js";
import { createOauthCookie, ALLOWED_DOMAIN } from "../../_lib/auth.js";

// Begins the Google OAuth 2.0 authorization-code flow (with PKCE, state and nonce).
export default route({ methods: ["GET"], access: "public" }, async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirect(res, "/login?error=config");
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appOrigin(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    hd: ALLOWED_DOMAIN, // UI hint only — enforced server-side in the callback
    prompt: "select_account",
  });

  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params}`, [
    createOauthCookie({ state, nonce, verifier }),
  ]);
});
