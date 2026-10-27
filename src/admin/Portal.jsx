import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Overview from "./Overview.jsx";
import Employees from "./Employees.jsx";
import Access from "./Access.jsx";
import Logs from "./Logs.jsx";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "employees", label: "Employees" },
  { id: "access", label: "Tool Access" },
  { id: "logs", label: "Activity Logs" },
];

export default function Portal({ email }) {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({ employees: [], tools: [] });
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  // Bumped after any change so Overview / Logs refetch.
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await api.employees());
      setStatus("ready");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replaceEmployee = (employee) => {
    setData((d) => {
      const exists = d.employees.some((e) => e.email === employee.email);
      const employees = exists
        ? d.employees.map((e) => (e.email === employee.email ? employee : e))
        : [...d.employees, employee].sort((a, b) => a.email.localeCompare(b.email));
      return { ...d, employees };
    });
    setVersion((v) => v + 1);
  };

  return (
    <div className="portal">
      <div className="portal__head">
        <div>
          <p className="hero__eyebrow" style={{ textAlign: "left" }}>Admin Portal</p>
          <h1 className="portal__title">Access management</h1>
        </div>
        <span className="portal__who">{email}</span>
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview version={version} />}
      {tab === "logs" && <Logs version={version} />}

      {(tab === "employees" || tab === "access") &&
        (status === "loading" ? (
          <p className="muted-center">Loading employees…</p>
        ) : status === "error" ? (
          <div className="panel state">
            <p className="form-error">{error}</p>
            <button className="btn btn--ghost" onClick={load}>Retry</button>
          </div>
        ) : tab === "employees" ? (
          <Employees data={data} onChange={replaceEmployee} />
        ) : (
          <Access data={data} onChange={replaceEmployee} />
        ))}
    </div>
  );
}
