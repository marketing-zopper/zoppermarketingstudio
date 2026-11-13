import { route, readJson, send } from "../_lib/http.js";
import { listEmployees, createEmployee, addLogs, getSettings, saveSettings } from "../_lib/store.js";
import { normalize, toRecord, parseRolesInput, roleChangeLogs, EMAIL_RE } from "../_lib/employees.js";
import { TOOLS_META } from "../../shared/toolsMeta.js";
import { ROLES, NO_ACCESS, OPTIONAL_ROLES, ROLE_LABEL, availability, roleAvailable } from "../../shared/rbac.js";

// Admin routes are limited to the Global Super Admin (marketingext@zopper.com) by the route guard — which is
// also what makes switching optional roles on/off exclusive to that account.
export default route({ methods: ["GET", "POST", "PATCH"] }, async (req, res, session) => {
  if (req.method === "GET") {
    const employees = (await listEmployees())
      .map(normalize)
      .sort((a, b) => a.email.localeCompare(b.email));
    return send(res, 200, {
      employees,
      tools: TOOLS_META.map(({ id, title }) => ({ id, title })),
      roles: ROLES,
      availability: availability(await getSettings()),
    });
  }

  // PATCH { settings: { [toolId]: { viewerEnabled?: boolean, editorEnabled?: boolean } } }
  // Role availability. No Access and Admin are always available and cannot be changed.
  if (req.method === "PATCH") {
    const { settings: incoming } = await readJson(req);
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return send(res, 400, { error: "Invalid settings." });

    const allowedKeys = OPTIONAL_ROLES.map((r) => `${r}Enabled`);
    const settings = await getSettings();
    const logs = [];
    for (const [toolId, change] of Object.entries(incoming)) {
      const tool = TOOLS_META.find((t) => t.id === toolId);
      const keys = change && typeof change === "object" && !Array.isArray(change) ? Object.keys(change) : [];
      if (!tool || !keys.length || keys.some((k) => !allowedKeys.includes(k) || typeof change[k] !== "boolean")) {
        return send(res, 400, { error: "Invalid settings." });
      }
      for (const role of OPTIONAL_ROLES) {
        const value = change[`${role}Enabled`];
        if (value === undefined || roleAvailable(toolId, role, settings) === value) continue;
        settings[toolId] = { ...settings[toolId], [`${role}Enabled`]: value };
        logs.push({
          type: "setting_changed",
          target: tool.title,
          detail: `${ROLE_LABEL[role]} role ${value ? "enabled" : "disabled"}`,
        });
      }
    }
    if (logs.length) {
      await saveSettings(settings);
      await addLogs(logs.map((l) => ({ ...l, actor: session.email })));
    }
    return send(res, 200, { availability: availability(settings) });
  }

  // POST { email, name?, roles?: { [toolId]: roleId } } — employee and access are created in one write.
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 80);
  if (!EMAIL_RE.test(email)) {
    return send(res, 400, { error: "Enter a valid @zopper.com email address." });
  }

  const parsed = parseRolesInput(body.roles ?? {}, await getSettings());
  if (parsed.error) return send(res, 400, { error: parsed.error });
  // Every tool starts at No Access; the request can only raise it.
  const none = Object.fromEntries(TOOLS_META.map((t) => [t.id, NO_ACCESS]));
  const roles = { ...none, ...parsed.roles };

  const now = new Date().toISOString();
  const record = toRecord({ email, name, active: true, roles, review: {}, createdAt: now, updatedAt: now });
  if (!(await createEmployee(record))) {
    return send(res, 409, { error: "This employee already exists." });
  }
  await addLogs([
    { type: "employee_added", actor: session.email, target: email, detail: name ? `Added ${name}` : "Added employee" },
    ...roleChangeLogs(none, roles).map((l) => ({ ...l, actor: session.email, target: email })),
  ]);
  send(res, 201, { employee: normalize(record) });
});
