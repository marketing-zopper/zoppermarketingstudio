import React, { useState } from "react";
import { api } from "./api.js";
import { useToast } from "./Toast.jsx";

export default function Access({ data, onChange, onSettings }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState({}); // "email:tool" -> true

  const q = query.trim().toLowerCase();
  const rows = data.employees.filter((e) => !q || e.email.includes(q) || (e.name || "").toLowerCase().includes(q));
  const roleTools = data.tools.filter((t) => t.roleBased);

  async function run(key, task) {
    setPending((p) => ({ ...p, [key]: true }));
    try {
      await task();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setPending((p) => {
        const { [key]: _, ...rest } = p;
        return rest;
      });
    }
  }

  const toggle = (emp, tool) =>
    run(`${emp.email}:${tool.id}`, async () => {
      const next = !emp.permissions[tool.id];
      const { employee } = await api.updateEmployee(emp.email, { permissions: { [tool.id]: next } });
      onChange(employee);
      toast(`${next ? "Allowed" : "Revoked"} ${tool.title} for ${emp.email}`);
    });

  const setRole = (emp, tool, roleId) =>
    run(`${emp.email}:${tool.id}`, async () => {
      const { employee } = await api.updateEmployee(emp.email, { toolRoles: { [tool.id]: roleId } });
      onChange(employee);
      const label = tool.roles.find((r) => r.id === roleId)?.label;
      toast(`${emp.email} is now ${label} on ${tool.title}`);
    });

  // Only the Global Super Admin reaches this screen (the API enforces it as well).
  const setEditor = (tool, enabled) =>
    run(`editor:${tool.id}`, async () => {
      const { settings } = await api.updateSettings({ [tool.id]: { editorEnabled: enabled } });
      onSettings(settings);
      toast(`Editor role ${enabled ? "enabled" : "disabled"} for ${tool.title}`);
    });

  return (
    <>
      {roleTools.map((tool) => {
        const on = data.settings?.[tool.id]?.editorEnabled === true;
        const editors = data.employees.filter((e) => e.toolRoles?.[tool.id] === "editor").length;
        return (
          <div className="panel role-setting" key={tool.id}>
            <div className="role-setting__text">
              <h2 className="panel__title">{tool.title} · Editor role</h2>
              <p className="muted">
                Reserved for future use. While enabled, Editors have Viewer capabilities only. While disabled, it can’t be
                assigned and anyone already set to Editor has no access.
                {editors > 0 && ` ${editors} employee${editors === 1 ? " is" : "s are"} currently set to Editor.`}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${on ? "Disable" : "Enable"} the Editor role for ${tool.title}`}
              className={`switch${on ? " switch--on" : ""}`}
              disabled={pending[`editor:${tool.id}`]}
              onClick={() => setEditor(tool, !on)}
            >
              <span />
            </button>
          </div>
        );
      })}

      <div className="panel">
        <div className="panel__bar">
          <h2 className="panel__title">Tool access</h2>
          <input
            className="search"
            type="search"
            placeholder="Search employees…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {data.employees.length === 0 ? (
          <p className="empty">No employees yet. Add one in the Employees tab.</p>
        ) : rows.length === 0 ? (
          <p className="empty">No employees match “{query}”.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  {data.tools.map((t) => (
                    <th key={t.id} className="center">{t.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((emp) => (
                  <tr key={emp.email} className={emp.active ? "" : "row--inactive"}>
                    <td>
                      <div className="who">
                        <strong>{emp.name || emp.email}</strong>
                        {emp.name && <span>{emp.email}</span>}
                        {!emp.active && <span className="badge badge--muted">Inactive</span>}
                      </div>
                    </td>
                    {data.tools.map((t) => {
                      const key = `${emp.email}:${t.id}`;
                      if (t.roleBased) {
                        const editorOff = data.settings?.[t.id]?.editorEnabled !== true;
                        const current = emp.toolRoles?.[t.id] || "none";
                        return (
                          <td key={t.id} className="center">
                            <select
                              className="role-select"
                              aria-label={`${t.title} role for ${emp.email}`}
                              value={current}
                              disabled={!emp.active || pending[key]}
                              onChange={(e) => setRole(emp, t, e.target.value)}
                            >
                              {t.roles.map((r) => (
                                <option key={r.id} value={r.id} disabled={r.id === "editor" && editorOff && current !== "editor"}>
                                  {r.label}
                                  {r.id === "editor" && editorOff ? " (disabled)" : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }
                      const on = emp.permissions[t.id];
                      return (
                        <td key={t.id} className="center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={`${on ? "Revoke" : "Allow"} ${t.title} for ${emp.email}`}
                            className={`switch${on ? " switch--on" : ""}`}
                            disabled={!emp.active || pending[key]}
                            onClick={() => toggle(emp, t)}
                          >
                            <span />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">
          Switches for the other tools are recorded centrally for future integration; they don’t yet restrict access to those
          tools. The Croma Feedback Dashboard role is enforced by the server on every request. “No Access” is the default.
        </p>
      </div>
    </>
  );
}
