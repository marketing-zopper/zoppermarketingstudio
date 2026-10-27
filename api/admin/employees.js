import { route, readJson, send } from "../_lib/http.js";
import { listEmployees, getEmployee, saveEmployee, addLog } from "../_lib/store.js";
import { normalize, EMAIL_RE } from "../_lib/employees.js";
import { TOOLS_META } from "../../shared/toolsMeta.js";

export default route({ methods: ["GET", "POST"] }, async (req, res, session) => {
  if (req.method === "GET") {
    const employees = (await listEmployees())
      .map(normalize)
      .sort((a, b) => a.email.localeCompare(b.email));
    return send(res, 200, {
      employees,
      tools: TOOLS_META.map(({ id, title }) => ({ id, title })),
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
