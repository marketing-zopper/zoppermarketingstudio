import React from "react";

// To add a new capability later, add an entry here — the grid picks it up.
// Set `url: null` to show it as a "Coming soon" card.
const TOOLS = [
  {
    id: "design-request",
    title: "Design Request Tool",
    description:
      "Raise and track design requests for the marketing team — share briefs, formats and deadlines in one place.",
    url: "https://design-request-tool.vercel.app",
    accent: "var(--light-blue)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    id: "printables-studio",
    title: "Zopper Printables Studio",
    description:
      "Generate print-ready marketing collaterals — standees, posters, flyers and more — from brand-approved templates.",
    url: "https://zopper-printables-studio.vercel.app",
    accent: "var(--orange)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="7" rx="1" />
      </svg>
    ),
  },
];

function ToolCard({ tool }) {
  const disabled = !tool.url;
  const Tag = disabled ? "div" : "a";
  return (
    <Tag
      className={`card${disabled ? " card--disabled" : ""}`}
      style={{ "--accent": tool.accent }}
      {...(disabled ? {} : { href: tool.url })}
    >
      <span className="card__icon">{tool.icon}</span>
      <h2 className="card__title">{tool.title}</h2>
      <p className="card__desc">{tool.description}</p>
      <span className="card__cta">
        {disabled ? "Coming soon" : "Open tool"}
        {!disabled && <span className="card__arrow">→</span>}
      </span>
    </Tag>
  );
}

export default function App() {
  return (
    <div className="page">
      <header className="header">
        <img src="/zopper-logo.png" alt="Zopper" className="header__logo" />
      </header>

      <main className="main">
        <p className="hero__eyebrow">Internal Platform</p>
        <h1 className="hero__title">Zopper Marketing Studio</h1>
        <p className="hero__sub">Choose a tool to get started.</p>

        <section className="grid">
          {TOOLS.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </section>
      </main>

      <footer className="footer">© {new Date().getFullYear()} Zopper · Internal tools</footer>
    </div>
  );
}
