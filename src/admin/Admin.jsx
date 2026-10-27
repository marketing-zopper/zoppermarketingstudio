import React from "react";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { ToastProvider } from "./Toast.jsx";
import Portal from "./Portal.jsx";

// The Google-verified administrator email goes straight in. Everyone else is stopped here
// (and the admin APIs enforce the same rule on the server).
export default function Admin() {
  const { email, isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <Layout back={{ to: "/", label: "Back to Studio" }}>
        <p className="hero__eyebrow">Admin Portal</p>
        <h1 className="hero__title">Access Not Allowed</h1>
        <p className="hero__sub">You don't have permission to access the Admin Portal.</p>
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
