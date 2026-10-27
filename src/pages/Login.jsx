import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const ERRORS = {
  domain: "Only Zopper Google Workspace accounts (@zopper.com) can sign in.",
  unverified: "Your Google email address isn’t verified.",
  cancelled: "Sign-in was cancelled.",
  config: "Google sign-in isn’t configured yet. Please contact the Marketing team.",
  failed: "We couldn’t complete sign-in. Please try again.",
};

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export default function Login() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const error = ERRORS[params.get("error")];

  if (auth.state === "ok") return <Navigate to="/" replace />;

  return (
    <Layout>
      <p className="hero__eyebrow">Internal Platform</p>
      <h1 className="hero__title">Zopper Marketing Studio</h1>
      <p className="hero__sub">Sign in with your Zopper Google account.</p>

      <div className="login">
        <div className="panel login__form">
          {error && <p className="form-error" role="alert" style={{ margin: 0 }}>{error}</p>}
          {/* Full navigation: the OAuth flow is handled entirely on the server. */}
          <a className="btn btn--ghost google-btn" href="/api/auth/google/start">
            <GoogleLogo />
            Continue with Google
          </a>
          <p className="note" style={{ margin: 0, textAlign: "center" }}>
            Access is limited to approved @zopper.com employees.
          </p>
        </div>
      </div>
    </Layout>
  );
}
