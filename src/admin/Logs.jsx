import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatTime } from "./format.js";

const LABELS = {
  employee_added: ["Added", "ok"],
  employee_updated: ["Edited", "info"],
  employee_deactivated: ["Deactivated", "warn"],
  employee_reactivated: ["Reactivated", "ok"],
  permission_granted: ["Allowed", "ok"],
  permission_revoked: ["Revoked", "warn"],
};

export default function Logs({ version }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api
      .logs()
      .then((d) => live && setLogs(d.logs))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [version]);

  if (error) return <div className="panel state"><p className="form-error">{error}</p></div>;
  if (!logs) return <p className="muted-center">Loading activity…</p>;

  return (
    <div className="panel">
      <h2 className="panel__title">Activity logs</h2>
      {logs.length === 0 ? (
        <p className="empty">No activity yet. Changes you make will appear here.</p>
      ) : (
        <ul className="feed">
          {logs.map((l) => {
            const [label, tone] = LABELS[l.type] || [l.type, "info"];
            return (
              <li key={l.id}>
                <span className={`badge badge--${tone}`}>{label}</span>
                <span className="feed__main">
                  <strong>{l.target}</strong> — {l.detail}
                  {l.actor && <span className="feed__by"> · by {l.actor}</span>}
                </span>
                <time>{formatTime(l.at)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
