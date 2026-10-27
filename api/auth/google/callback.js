import { OAuth2Client } from "google-auth-library";
import { route, redirect, appOrigin } from "../../_lib/http.js";
import { getOauthState, clearOauthCookie, createUserCookie, ALLOWED_DOMAIN } from "../../_lib/auth.js";
import { checkGoogleClaims } from "../../_lib/access.js";

export default route({ methods: ["GET"], access: "public" }, async (req, res) => {
  const fail = (code) => redirect(res, `/login?error=${code}`, [clearOauthCookie()]);

  const url = new URL(req.url, "http://localhost");
  if (url.searchParams.get("error")) return fail("cancelled");

  const saved = getOauthState(req);
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return fail("failed");

  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${appOrigin(req)}/api/auth/google/callback`
    );
    const { tokens } = await client.getToken({ code, codeVerifier: saved.verifier });
    // Verifies signature, issuer, audience and expiry.
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const claims = ticket.getPayload();

    if (claims.nonce !== saved.nonce) return fail("failed");
    const problem = checkGoogleClaims(claims, ALLOWED_DOMAIN);
    if (problem) return fail(problem);

    // Identity only. Whether this person is approved is checked against Redis on every request.
    redirect(res, "/", [createUserCookie(claims.email.toLowerCase()), clearOauthCookie()]);
  } catch (err) {
    console.error("Google sign-in failed:", err?.message);
    fail("failed");
  }
});
