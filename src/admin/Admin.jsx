import React, { useState } from "react";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "./api.js";
import { ToastProvider } from "./Toast.jsx";
import Portal from "./Portal.jsx";

// Second factor for the administrator: the existing admin password.
// The email comes from the Google session (shown read-only), never from this form.
function Login({ email, onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err.message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <p className="hero__eyebrow">Admin Portal</p>
      <h1 className="hero__title">Administrator sign in</h1>
      <p className="hero__sub">Enter the administrator password to continue.</p>

      <form className="panel login__form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} readOnly disabled />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function Admin() {
  const { email, isAdmin, adminSession, refresh } = useAuth();

  // Direct visits by anyone else stop here (the admin APIs enforce the same rule server-side).
  if (!isAdmin) {
    return (
      <Layout back={{ to: "/", label: "Back to Studio" }}>
        <p className="hero__eyebrow">Admin Portal</p>
        <h1 className="hero__title">Access Not Allowed</h1>
        <p className="hero__sub">You don't have permission to access the Admin Portal.</p>
      </Layout>
    );
  }

  if (!adminSession) {
    return (
      <Layout back={{ to: "/", label: "Back to Studio" }}>
        <Login email={email} onSuccess={refresh} />
      </Layout>
    );
  }

  return (
    <ToastProvider>
      <Layout wide back={{ to: "/", label: "Back to Studio" }}>
        <Portal email={email} />
      </Layout>
    </ToastProvider>
  );
}
