import React from "react";
import { Navigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { useAuth } from "./AuthContext.jsx";

// Gate for every protected page. The decision always comes from the server session endpoint.
export default function RequireAuth({ children }) {
  const auth = useAuth();

  if (auth.state === "loading") {
    return (
      <Layout>
        <p className="muted-center">Loading…</p>
      </Layout>
    );
  }

  if (auth.state === "signed_out") return <Navigate to="/login" replace />;

  if (auth.state === "denied") {
    return (
      <Layout>
        <p className="hero__eyebrow">Zopper Marketing Studio</p>
        <h1 className="hero__title">Access Not Allowed</h1>
        <p className="hero__sub">
          {auth.email} isn’t approved for this workspace.
          <br />
          Please contact the Marketing team to request access.
        </p>
        <button className="btn btn--primary" onClick={auth.signOut}>
          Sign in with a different account
        </button>
      </Layout>
    );
  }

  if (auth.state === "error") {
    return (
      <Layout>
        <p className="hero__eyebrow">Zopper Marketing Studio</p>
        <h1 className="hero__title">We couldn’t verify your access</h1>
        <p className="hero__sub">{auth.error}</p>
        <button className="btn btn--primary" onClick={auth.refresh}>
          Try again
        </button>
      </Layout>
    );
  }

  return children;
}
