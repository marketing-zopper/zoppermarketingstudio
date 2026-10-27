import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import AccessModal from "../components/AccessModal.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { fetchSession } from "../admin/api.js";
import { ICONS } from "../tools.jsx";

export default function Landing() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [checking, setChecking] = useState(false);
  const [modal, setModal] = useState(null);

  // Always visible. On click the server re-verifies who you are before navigating.
  async function openAdmin() {
    setChecking(true);
    try {
      const s = await fetchSession();
      if (s.status === "ok" && s.isAdmin) navigate("/admin");
      else if (s.status === "ok") {
        setModal({ message: "You don't have permission to access the Admin Portal." });
      } else refresh(); // signed out / no longer approved
    } catch (err) {
      setModal({ title: "Something went wrong", message: err.message });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Layout>
      <p className="hero__eyebrow">Internal Platform</p>
      <h1 className="hero__title">Zopper Marketing Studio</h1>
      <p className="hero__sub">One workspace. All your internal tools.</p>

      <section className="grid">
        <Card
          to="/employee"
          icon={ICONS.employee}
          accent="var(--light-blue)"
          title="Employee Dashboard"
          description="Access Zopper's internal tools and workspaces."
          cta="Open Dashboard"
        />
        <Card
          onClick={openAdmin}
          busy={checking}
          icon={ICONS.admin}
          accent="var(--orange)"
          title="Admin Portal"
          description="Manage employee access and tool permissions."
          cta="Open Admin Portal"
        />
      </section>

      {modal && <AccessModal {...modal} onClose={() => setModal(null)} />}
    </Layout>
  );
}
