import React, { useState } from "react";
import { api } from "./api.js";
import { useToast } from "./Toast.jsx";

export default function Access({ data, onChange }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState({}); // "email:tool" -> true

  const q = query.trim().toLowerCase();
  const rows = data.employees.filter((e) => !q || e.email.includes(q) || (e.name || "").toLowerCase().includes(q));

  async function toggle(emp, tool) {
    const key = `${emp.email}:${tool.id}`;
    const next = !emp.permissions[tool.id];
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const { employee } = await api.updateEmployee(emp.email, { permissions: { [tool.id]: next } });
      onChange(employee);
      toast(`${next ? "Allowed" : "Revoked"} ${tool.title} for ${emp.email}`);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setPending((p) => {
        const { [key]: _, ...rest } = p;
        return rest;
      });
    }
  }

  return (
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
                    const on = emp.permissions[t.id];
                    const key = `${emp.email}:${t.id}`;
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
        Permissions are recorded centrally for future integration. They don’t yet restrict access to the tools themselves.
      </p>
    </div>
  );
}
