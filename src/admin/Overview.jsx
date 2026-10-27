import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatTime } from "./format.js";

export default function Overview({ version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api
      .overview()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [version]);

  if (error) return <div className="panel state"><p className="form-error">{error}</p></div>;
  if (!data) return <p className="muted-center">Loading overview…</p>;

  const stats = [
    { label: "Total employees", value: data.totalEmployees },
    { label: "Active", value: data.activeEmployees },
    { label: "Inactive", value: data.inactiveEmployees },
    { label: "Available tools", value: data.totalTools },
  ];

  return (
    <>
      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className="panel stat">
            <span className="stat__value">{s.value}</span>
            <span className="stat__label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2 className="panel__title">Recent permission changes</h2>
        {data.recentPermissionChanges.length === 0 ? (
          <p className="empty">No permission changes yet.</p>
        ) : (
          <ul className="feed">
            {data.recentPermissionChanges.map((l) => (
              <li key={l.id}>
                <span className={`dot dot--${l.type === "permission_granted" ? "ok" : "warn"}`} />
                <span className="feed__main">
                  <strong>{l.target}</strong> — {l.detail}
                </span>
                <time>{formatTime(l.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
