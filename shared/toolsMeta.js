// Single source of truth for the internal tools.
// Used by the Employee Dashboard (UI), the Admin API and the role model in shared/rbac.js.
// To add a tool: add an entry here and an icon in src/tools.jsx.
//
// Every tool uses the same four roles (see shared/rbac.js): No Access -> Viewer -> Editor -> Admin.
//   defaults      which OPTIONAL roles (Viewer / Editor) are available until the Global Super Admin changes it.
//                 No Access and Admin are always available.
//   capabilities  optional: what each role may do inside the tool. Tools without it use the generic
//                 open / view / edit / manage ladder. Every role has a defined set before it can be enabled.
//   internal      built into this app (an internal route) rather than a separate site.
export const TOOLS_META = [
  {
    id: "design-request",
    title: "Design Request Tool",
    description:
      "Raise and track design requests for the marketing team — share briefs, formats and deadlines in one place.",
    url: "https://design-request-tool.vercel.app",
    accent: "light-blue",
    defaults: { viewer: false, editor: true },
  },
  {
    id: "printables-studio",
    title: "Zopper Printables Studio",
    description:
      "Generate print-ready marketing collaterals — standees, posters, flyers and more — from brand-approved templates.",
    url: "https://zopper-printables-studio.vercel.app",
    accent: "orange",
    defaults: { viewer: true, editor: true },
  },
  {
    id: "service-triage",
    title: "Customer Service Triage",
    description: "Manage, categorize, and track customer service requests efficiently.",
    url: "https://zopper-service-triage.vercel.app",
    accent: "dark-blue",
    defaults: { viewer: true, editor: true },
  },
  // Built into this app; its APIs enforce the role on every request.
  {
    id: "croma-feedback-dashboard",
    title: "Croma Feedback Dashboard",
    description: "Review Croma store feedback, add internal comments and manage submissions.",
    url: "/croma-feedback-dashboard",
    accent: "dark-blue",
    internal: true,
    defaults: { viewer: true, editor: false },
    capabilities: {
      viewer: ["view", "comment"],
      editor: ["view", "comment"], // reserved: Viewer-level until separately defined
      admin: ["view", "comment", "archive"],
    },
  },
];
