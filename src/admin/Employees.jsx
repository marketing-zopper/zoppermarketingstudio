import React, { useState } from "react";
import { api } from "./api.js";
import { useToast } from "./Toast.jsx";

// "Tool title" for on/off tools, "Tool title (Role)" for role-based tools; nothing when there is no access.
function accessList(tools, emp) {
  return tools.flatMap((t) => {
    if (!t.roleBased) return emp.permissions[t.id] ? [t.title] : [];
    const role = emp.toolRoles?.[t.id] || "none";
    return role === "none" ? [] : [`${t.title} (${t.roles.find((r) => r.id === role)?.label || role})`];
  });
}

function EditModal({ employee, tools, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(employee.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(changes, message) {
    setBusy(true);
    setError("");
    try {
      const { employee: updated } = await api.updateEmployee(employee.email, changes);
      onSaved(updated);
      toast(message);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const allowed = accessList(tools, employee);

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <h2 className="panel__title">Edit employee</h2>
        <p className="muted">{employee.email}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({ name }, "Employee updated");
          }}
        >
          <label className="field">
            <span>Name</span>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </label>

          <div className="field">
            <span>Tool access</span>
            <p className="muted">
              {allowed.length ? allowed.join(", ") : "No tools allowed"} — manage in the Tool Access tab.
            </p>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal__actions">
            {employee.active ? (
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => save({ active: false }, "Employee deactivated")}
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => save({ active: true }, "Employee reactivated")}
              >
                Reactivate
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" disabled={busy}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Employees({ data, onChange }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [editing, setEditing] = useState(null);

  const q = query.trim().toLowerCase();
  const rows = data.employees.filter((e) => !q || e.email.includes(q) || (e.name || "").toLowerCase().includes(q));

  async function add(e) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    try {
      const { employee } = await api.addEmployee(email, name);
      onChange(employee);
      toast(`Added ${employee.email}`);
      setEmail("");
      setName("");
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <form className="panel add" onSubmit={add}>
        <h2 className="panel__title">Add employee</h2>
        <div className="add__row">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              required
              placeholder="name@zopper.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Name (optional)</span>
            <input value={name} maxLength={80} placeholder="Full name" onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn--primary add__btn" disabled={adding}>
            {adding ? "Adding…" : "Add employee"}
          </button>
        </div>
        {addError && <p className="form-error" role="alert">{addError}</p>}
        <p className="note">New employees start with no tool permissions.</p>
      </form>

      <div className="panel">
        <div className="panel__bar">
          <h2 className="panel__title">Employees ({data.employees.length})</h2>
          <input
            className="search"
            type="search"
            placeholder="Search employees…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {data.employees.length === 0 ? (
          <p className="empty">No employees yet. Add the first one above.</p>
        ) : rows.length === 0 ? (
          <p className="empty">No employees match “{query}”.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Tool access</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((emp) => (
                  <tr key={emp.email} className={emp.active ? "" : "row--inactive"}>
                    <td>
                      <div className="who">
                        <strong>{emp.name || emp.email}</strong>
                        {emp.name && <span>{emp.email}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge--${emp.active ? "ok" : "muted"}`}>
                        {emp.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="chips">
                        {accessList(data.tools, emp).map((label) => (
                          <span key={label} className="chip">{label}</span>
                        ))}
                        {accessList(data.tools, emp).length === 0 && <span className="muted">None</span>}
                      </div>
                    </td>
                    <td className="right">
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(emp)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          key={editing.email}
          employee={editing}
          tools={data.tools}
          onClose={() => setEditing(null)}
          onSaved={onChange}
        />
      )}
    </>
  );
}
