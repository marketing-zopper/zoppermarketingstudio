import React from "react";
import { TOOLS_META } from "../shared/toolsMeta.js";

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const ICONS = {
  "design-request": (
    <svg {...svgProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  "printables-studio": (
    <svg {...svgProps}>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </svg>
  ),
  // support ticket
  "service-triage": (
    <svg {...svgProps}>
      <path d="M3 9a2 2 0 0 0 0 6v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2a2 2 0 0 1 0-6V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1Z" />
      <path d="M13 6v2" />
      <path d="M13 11v2" />
      <path d="M13 16v2" />
    </svg>
  ),
  employee: (
    <svg {...svgProps}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 4.6a3.2 3.2 0 0 1 0 6.2" />
      <path d="M18 14.4A6 6 0 0 1 21 20" />
    </svg>
  ),
  admin: (
    <svg {...svgProps}>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.1 8.1 7.5 9.5 4.4-1.4 7.5-5 7.5-9.5V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  ),
};

// Tool definitions + their icons, ready for the UI.
export const TOOLS = TOOLS_META.map((t) => ({
  ...t,
  accent: `var(--${t.accent})`,
  icon: ICONS[t.id],
}));
