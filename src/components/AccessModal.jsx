import React, { useEffect } from "react";

// Branded "Access Not Allowed" / error dialog.
export default function AccessModal({ title = "Access Not Allowed", message, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="access-title" onClick={onClose}>
      <div className="modal__box denied" onClick={(e) => e.stopPropagation()}>
        <span className="denied__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 4.5 6v5.5c0 4.5 3.1 8.1 7.5 9.5 4.4-1.4 7.5-5 7.5-9.5V6Z" />
            <path d="m9.5 9.5 5 5" />
            <path d="m14.5 9.5-5 5" />
          </svg>
        </span>
        <h2 id="access-title" className="denied__title">{title}</h2>
        <p className="denied__msg">{message}</p>
        <button className="btn btn--primary" onClick={onClose} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}
