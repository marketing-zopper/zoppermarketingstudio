import React from "react";
import { Link } from "react-router-dom";

// Navigation/tool card.
//   to      -> internal route (link)
//   href    -> external site (link opened in a new tab)
//   onClick -> action card (rendered as a button; used for server-checked navigation)
//   none    -> "Coming soon"
export default function Card({ icon, title, description, cta, accent, to, href, onClick, busy = false }) {
  const disabled = !to && !href && !onClick;
  const className = `card${disabled ? " card--disabled" : ""}${onClick ? " card--action" : ""}`;
  const style = { "--accent": accent };
  const body = (
    <>
      <span className="card__icon">{icon}</span>
      <h2 className="card__title">{title}</h2>
      <p className="card__desc">{description}</p>
      <span className="card__cta">
        {disabled ? "Coming soon" : busy ? "Checking access…" : cta}
        {!disabled && !busy && <span className="card__arrow">→</span>}
      </span>
    </>
  );

  if (to) return <Link to={to} className={className} style={style}>{body}</Link>;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick} disabled={busy} aria-busy={busy}>
        {body}
      </button>
    );
  }
  return <div className={className} style={style}>{body}</div>;
}
