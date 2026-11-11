import { route, readJson, send } from "../_lib/http.js";
import { listEmployees, getEmployee, saveEmployee, addLog, getSettings, saveSettings } from "../_lib/store.js";
import { normalize, EMAIL_RE, ROLE_TOOLS } from "../_lib/employees.js";
import { TOOLS_META } from "../../shared/toolsMeta.js";

// Admin routes are limited to the Global Super Admin (marketingext@zopper.com) by the route guard,
// which is what makes enabling the Editor role exclusive to that account.
export default route({ methods: ["GET", "POST", "PATCH"] }, async (req, res, session) => {
  if (req.method === "GET") {
    const employees = (await listEmployees())
      .map(normalize)
      .sort((a, b) => a.email.localeCompare(b.email));
    const settings = await getSettings();
    return send(res, 200, {
      employees,
      tools: TOOLS_META.map(({ id, title, roleBased, roles }) => ({ id, title, ...(roleBased ? { roleBased, roles } : {}) })),
      settings: Object.fromEntries(ROLE_TOOLS.map((t) => [t.id, { editorEnabled: settings[t.id]?.editorEnabled === true }])),
    });
  }

  // PATCH { settings: { [toolId]: { editorEnabled: boolean } } }
  if (req.method === "PATCH") {
    const { settings: incoming } = await readJson(req);
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return send(res, 400, { error: "Invalid settings." });
    const settings = await getSettings();
    for (const [toolId, value] of Object.entries(incoming)) {
      const tool = ROLE_TOOLS.find((t) => t.id === toolId);
      if (!tool || typeof value?.editorEnabled !== "boolean") return send(res, 400, { error: "Invalid settings." });
      if ((settings[toolId]?.editorEnabled === true) !== value.editorEnabled) {
        settings[toolId] = { ...settings[toolId], editorEnabled: value.editorEnabled };
        await saveSettings(settings);
        await addLog({
          type: "setting_changed",
          actor: session.email,
          target: tool.title,
          detail: `Editor role ${value.editorEnabled ? "enabled" : "disabled"}`,
        });
      }
    }
    return send(res, 200, {
      settings: Object.fromEntries(ROLE_TOOLS.map((t) => [t.id, { editorEnabled: settings[t.id]?.editorEnabled === true }])),
    });
  }

  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 80);
  if (!EMAIL_RE.test(email)) {
    return send(res, 400, { error: "Enter a valid @zopper.com email address." });
  }
  if (await getEmployee(email)) {
    return send(res, 409, { error: "This employee already exists." });
  }

  const now = new Date().toISOString();
  // New employees start with no permissions.
  const employee = normalize({ email, name, active: true, permissions: {}, createdAt: now, updatedAt: now });
  await saveEmployee(employee);
  await addLog({ type: "employee_added", actor: session.email, target: email, detail: name ? `Added ${name}` : "Added employee" });
  send(res, 201, { employee });
});
