import { route, readJson, send } from "../_lib/http.js";
import { getEmployee, saveEmployee, addLogs, getSettings } from "../_lib/store.js";
import { normalize, toRecord, parseRolesInput, roleChangeLogs } from "../_lib/employees.js";

// PATCH { email, name?, active?, roles?: { [toolId]: "no_access" | "viewer" | "editor" | "admin" } }
// Profile and roles are validated together and saved in ONE write of the employee record, so a request
// either applies completely or not at all. Only the Global Super Admin reaches this route (route guard).
export default route({ methods: ["PATCH"] }, async (req, res, session) => {
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const current = await getEmployee(email);
  if (!current) return send(res, 404, { error: "Employee not found." });

  const next = normalize(current);
  const logs = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (name !== (current.name || "")) {
      next.name = name;
      logs.push({ type: "employee_updated", detail: `Name changed to "${name || "(none)"}"` });
    }
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return send(res, 400, { error: "Invalid status." });
    if (body.active !== current.active) {
      next.active = body.active;
      logs.push(
        body.active
          ? { type: "employee_reactivated", detail: "Employee reactivated" }
          : { type: "employee_deactivated", detail: "Employee deactivated" }
      );
    }
  }

  if (body.roles !== undefined) {
    const parsed = parseRolesInput(body.roles, await getSettings(), next.roles);
    if (parsed.error) return send(res, 400, { error: parsed.error });

    const before = next.roles;
    next.roles = { ...before, ...parsed.roles };
    logs.push(...roleChangeLogs(before, next.roles));
  }

  if (logs.length) {
    next.updatedAt = new Date().toISOString();
    await saveEmployee(toRecord(next));
    await addLogs(logs.map((l) => ({ ...l, actor: session.email, target: email })));
  }
  send(res, 200, { employee: normalize(toRecord(next)) });
});
