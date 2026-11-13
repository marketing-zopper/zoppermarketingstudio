import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { useToast } from "./Toast.jsx";

const NO_ACCESS = "no_access";
const OPTIONAL_ROLES = ["viewer", "editor"]; // the only roles the Global Super Admin can switch on/off

const roleOn = (data, toolId, roleId) => data.availability?.[toolId]?.[roleId] === true;
const roleLabel = (data, id) => data.roles.find((r) => r.id === id)?.label || id;

// Every tool uses the same four roles. Roles that are switched off stay visible but can't be picked.
function RoleSelect({ id, tool, data, value, onChange, label, disabled, inline }) {
  const heldButOff = value !== NO_ACCESS && !roleOn(data, tool.id, value);
  return (
    <select
      id={id}
      className={`role-select${inline ? " role-select--inline" : ""}${heldButOff ? " role-select--off" : ""}`}
      aria-label={label || `${tool.title} role`}
      title={heldButOff ? "This role is switched off, so it gives no access right now" : undefined}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {data.roles.map((r) => {
        const on = roleOn(data, tool.id, r.id);
        return (
          <option key={r.id} value={r.id} disabled={!on}>
            {r.label}
            {on ? "" : " (disabled)"}
          </option>
        );
      })}
    </select>
  );
}

// Add and edit share this form: profile + one role per tool, saved together in a single request.
function EmployeeModal({ employee, data, onClose, onSaved }) {
  const toast = useToast();
  const adding = !employee;
  const initial = employee?.roles || Object.fromEntries(data.tools.map((t) => [t.id, NO_ACCESS]));
  const locked = !adding && !employee.active; // deactivated employees keep their access untouched

  const [email, setEmail] = useState("");
  const [name, setName] = useState(employee?.name || "");
  const [roles, setRoles] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e, { active, message } = {}) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (adding) {
        const { employee: created } = await api.addEmployee(email, name, roles);
        onSaved(created);
        toast(`Added ${created.email}`);
      } else {
        // Only send the roles that changed.
        const sent = locked
          ? {}
          : Object.fromEntries(
              data.tools.filter((t) => roles[t.id] !== initial[t.id]).map((t) => [t.id, roles[t.id]])
            );
        const { employee: updated } = await api.updateEmployee(employee.email, {
          name,
          ...(Object.keys(sent).length ? { roles: sent } : {}),
          ...(active === undefined ? {} : { active }),
        });
        onSaved(updated);
        toast(message || "Employee updated");
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="emp-modal-title" onClick={onClose}>
      <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <h2 id="emp-modal-title" className="panel__title">{adding ? "Add employee" : "Edit employee"}</h2>
        {!adding && <p className="muted">{employee.email}</p>}

        <form onSubmit={submit}>
          {adding && (
            <label className="field">
              <span>Email</span>
              <input type="email" required autoFocus placeholder="name@zopper.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>Name{adding ? " (optional)" : ""}</span>
            <input value={name} maxLength={80} placeholder="Full name" onChange={(e) => setName(e.target.value)} />
          </label>

          <fieldset className="role-grid" disabled={locked}>
            <legend>Tool access</legend>
            {data.tools.map((t) => (
              <div className="role-row" key={t.id}>
                <label htmlFor={`role-${t.id}`}>
                  {t.title}
                </label>
                <RoleSelect id={`role-${t.id}`} tool={t} data={data} value={roles[t.id]} onChange={(r) => setRoles((s) => ({ ...s, [t.id]: r }))} />
              </div>
            ))}
          </fieldset>

          <p className="note">
            {locked
              ? "This employee is inactive. Reactivate them to change their access."
              : adding
                ? "Every tool starts at No Access."
                : "Disabled roles are switched off in Role availability below."}
          </p>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal__actions">
            {!adding &&
              (employee.active ? (
                <button type="button" className="btn btn--danger" disabled={busy} onClick={() => submit(null, { active: false, message: "Employee deactivated" })}>
                  Deactivate
                </button>
              ) : (
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => submit(null, { active: true, message: "Employee reactivated" })}>
                  Reactivate
                </button>
              ))}
            <span className="spacer" />
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" disabled={busy || locked}>
              {busy ? "Saving…" : adding ? "Add employee" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Which optional roles each tool offers. Visible only inside the Admin Portal, which only the Global Super
// Admin can open — and the API refuses anyone else.
function RoleAvailability({ data, onAvailability }) {
  const toast = useToast();
  const [pending, setPending] = useState("");

  async function toggle(tool, role, on) {
    const key = `${tool.id}:${role}`;
    setPending(key);
    try {
      const { availability } = await api.updateAvailability({ [tool.id]: { [`${role}Enabled`]: !on } });
      onAvailability(availability);
      toast(`${roleLabel(data, role)} role ${on ? "disabled" : "enabled"} for ${tool.title}`);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setPending("");
    }
  }

  return (
    <div className="panel" aria-labelledby="avail-title">
      <h2 className="panel__title" id="avail-title">Role availability</h2>
      <p className="muted">
        Choose which roles can be assigned for each tool. Employees keep any role you switch off, but it gives no access
        until it is switched back on. No Access and Admin are always available.
      </p>
      <div className="table-wrap avail">
        <table className="table">
          <thead>
            <tr>
              <th>Tool</th>
              {data.roles.map((r) => (
                <th key={r.id} className="center">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.tools.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.title}</strong></td>
                {data.roles.map((r) => {
                  if (!OPTIONAL_ROLES.includes(r.id)) {
                    return <td key={r.id} className="center"><span className="badge badge--muted">Always on</span></td>;
                  }
                  const on = roleOn(data, t.id, r.id);
                  const holders = data.employees.filter((e) => e.roles?.[t.id] === r.id).length;
                  return (
                    <td key={r.id} className="center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${on ? "Disable" : "Enable"} the ${r.label} role for ${t.title}`}
                        className={`switch${on ? " switch--on" : ""}`}
                        disabled={pending === `${t.id}:${r.id}`}
                        onClick={() => toggle(t, r.id, on)}
                      >
                        <span />
                      </button>
                      {holders > 0 && <div className="avail__count">{holders} assigned</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EmployeesAccess({ data, onChange, onAvailability }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // { employee } to edit, {} to add
  const [pending, setPending] = useState({}); // "email:tool" -> true while a role change is saving

  const q = query.trim().toLowerCase();
  const rows = data.employees.filter((e) => !q || e.email.includes(q) || (e.name || "").toLowerCase().includes(q));

  // Changing a dropdown in the directory saves that one role right away (same endpoint and checks as the form).
  async function setRole(emp, tool, role) {
    const key = `${emp.email}:${tool.id}`;
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const { employee } = await api.updateEmployee(emp.email, { roles: { [tool.id]: role } });
      onChange(employee);
      toast(`${emp.name || emp.email}: ${tool.title} → ${roleLabel(data, role)}`);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setPending(({ [key]: _, ...rest }) => rest);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel__bar">
          <h2 className="panel__title">Employees ({data.employees.length})</h2>
          <div className="panel__tools">
            <input className="search" type="search" placeholder="Search employees…" aria-label="Search employees" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn btn--primary" onClick={() => setModal({})}>Add Employee</button>
          </div>
        </div>

        {data.employees.length === 0 ? (
          <p className="empty">No employees yet. Click “Add Employee” to add the first one.</p>
        ) : rows.length === 0 ? (
          <p className="empty">No employees match “{query}”.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Status</th>
                  {data.tools.map((t) => (
                    <th key={t.id} className="center th--role">{t.title}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((emp) => {
                  return (
                    <tr key={emp.email} className={emp.active ? "" : "row--inactive"}>
                      <td>
                        <div className="who">
                          <strong>{emp.name || emp.email}</strong>
                          {emp.name && <span>{emp.email}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge--${emp.active ? "ok" : "muted"}`}>{emp.active ? "Active" : "Inactive"}</span>
                      </td>
                      {data.tools.map((t) => {
                        const role = emp.roles?.[t.id] || NO_ACCESS;
                        return (
                          <td key={t.id} className="center">
                            <RoleSelect
                              inline
                              tool={t}
                              data={data}
                              value={role}
                              label={`${t.title} role for ${emp.email}`}
                              disabled={!emp.active || !!pending[`${emp.email}:${t.id}`]}
                              onChange={(r) => setRole(emp, t, r)}
                            />
                          </td>
                        );
                      })}
                      <td className="right">
                        <button className="btn btn--ghost btn--sm" onClick={() => setModal({ employee: emp })}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RoleAvailability data={data} onAvailability={onAvailability} />

      {modal && (
        <EmployeeModal
          key={modal.employee?.email || "new"}
          employee={modal.employee}
          data={data}
          onClose={() => setModal(null)}
          onSaved={onChange}
        />
      )}
    </>
  );
}
