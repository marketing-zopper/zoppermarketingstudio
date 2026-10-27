// Single source of truth for the internal tools.
// Used by the Employee Dashboard (UI) and by the Admin API (permission keys).
// To add a tool: add an entry here and an icon in src/tools.jsx.
export const TOOLS_META = [
  {
    id: "design-request",
    title: "Design Request Tool",
    description:
      "Raise and track design requests for the marketing team — share briefs, formats and deadlines in one place.",
    url: "https://design-request-tool.vercel.app",
    accent: "light-blue",
  },
  {
    id: "printables-studio",
    title: "Zopper Printables Studio",
    description:
      "Generate print-ready marketing collaterals — standees, posters, flyers and more — from brand-approved templates.",
    url: "https://zopper-printables-studio.vercel.app",
    accent: "orange",
  },
  {
    id: "service-triage",
    title: "Customer Service Triage",
    description: "Manage, categorize, and track customer service requests efficiently.",
    url: "https://zopper-service-triage.vercel.app",
    accent: "dark-blue",
  },
];
