import React from "react";
import { Link } from "react-router-dom";

// Navigation/tool card.
//   to      -> internal route (link)
//   onClick -> action card (rendered as a button; used for server-checked navigation)
//   neither -> "Coming soon"
export default function Card({ icon, title, description, cta, accent, to, onClick, busy = false }) {
  const disabled = !to && !onClick;
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
  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick} disabled={busy} aria-busy={busy}>
        {body}
      </button>
    );
  }
  return <div className={className} style={style}>{body}</div>;
}
