import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import AccessModal from "../components/AccessModal.jsx";
import { api } from "../admin/api.js";
import { ICONS, TOOLS } from "../tools.jsx";

export default function Employee() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(null); // tool id being checked
  const [modal, setModal] = useState(null);

  // Every card is always shown. Each click gets a fresh server-side permission check;
  // the tool only opens on an explicit "allowed" answer.
  async function openTool(tool) {
    setChecking(tool.id);
    try {
      const result = await api.toolAccess(tool.id);
      if (result.allowed === true && result.url) {
        // Tools built into this app are internal routes; the others are separate sites.
        if (result.url.startsWith("/")) navigate(result.url);
        else window.location.assign(result.url);
        return;
      }
      setModal({
        message: "You don't have permission to access this tool. Please contact the admin to request access.",
      });
    } catch (err) {
      if (err.status === 401) return; // session changed; the auth gate takes over
      setModal({
        title: "Couldn't check your access",
        message: "We couldn't verify your permissions right now, so the tool wasn't opened. Please try again.",
      });
    } finally {
      setChecking(null);
    }
  }

  const toolCard = (tool) => (
    <Card
      key={tool.id}
      onClick={() => openTool(tool)}
      busy={checking === tool.id}
      icon={tool.icon}
      accent={tool.accent}
      title={tool.title}
      description={tool.description}
      cta="Open tool"
    />
  );

  return (
    <Layout back={{ to: "/", label: "Back to Studio" }} wide>
      <p className="hero__eyebrow">Employee Dashboard</p>
      <h1 className="hero__title">Your Tools</h1>
      <p className="hero__sub">Choose a tool to get started.</p>

      <section className="grid grid--tools">
        {TOOLS.filter((t) => !t.internal).map(toolCard)}
        {/* standalone public app (its own deployment, no login needed) — opens in a new tab */}
        <Card
          href="https://cromafeedbackform.vercel.app/"
          icon={ICONS.feedback}
          accent="var(--dark-blue)"
          title="Croma Feedback Form"
          description="Collect store feedback from Croma teams through a simple QR form."
          cta="Open tool"
        />
        {TOOLS.filter((t) => t.internal).map(toolCard)}
      </section>

      {modal && <AccessModal {...modal} onClose={() => setModal(null)} />}
    </Layout>
  );
}
