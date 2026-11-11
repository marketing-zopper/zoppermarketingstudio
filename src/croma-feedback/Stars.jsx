import React from "react";
import { RATING_LABELS } from "./format.js";

export default function Stars({ value }) {
  return (
    <span className={`cfd-rating cfd-rating--${value}`} title={`${value}/5 · ${RATING_LABELS[value] || ""}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path fill="currentColor" d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8Z" />
      </svg>
      <span>{value}</span>
      <span className="cfd-sr"> out of 5</span>
    </span>
  );
}
