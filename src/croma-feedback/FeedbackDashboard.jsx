import React, { useCallback, useEffect, useRef, useState } from "react";
import Layout from "../components/Layout.jsx";
import { ToastProvider, useToast } from "../admin/Toast.jsx";
import { api } from "../admin/api.js";
import FeedbackDrawer from "./FeedbackDrawer.jsx";
import Stars from "./Stars.jsx";
import { RATING_LABELS, formatDate, formatTime } from "./format.js";
import "./feedback-dashboard.css";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { store: "", state: "", rating: "", from: "", to: "", sort: "newest" };

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

function Dashboard() {
  const toast = useToast();
  const [tab, setTab] = useState("active");
  const [searchText, setSearchText] = useState("");
  const [q, setQ] = useState(""); // debounced copy of searchText
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null); // last successful response
  const [status, setStatus] = useState("loading"); // loading | ready | error | denied
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const requestId = useRef(0);
  const lastRow = useRef(null);

  useEffect(() => {
    document.title = "Croma Feedback Dashboard · Zopper";
    // Inter, as in the reference design (loaded for this page only).
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    return () => {
      document.title = "Zopper Marketing Studio";
      link.remove();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchText.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus("loading");
    const params = { tab, page, pageSize: PAGE_SIZE, sort: filters.sort };
    if (q) params.q = q;
    for (const k of ["store", "state", "rating", "from", "to"]) if (filters[k]) params[k] = filters[k];
    try {
      const res = await api.feedbackItems(params);
      if (id !== requestId.current) return; // a newer request superseded this one
      setData(res);
      setStatus("ready");
    } catch (err) {
      if (id !== requestId.current) return;
      if (err.status === 401) return; // the auth gate takes over
      if (err.status === 403) return setStatus("denied");
      setError(err.message);
      setStatus("error");
    }
  }, [tab, page, q, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const changeTab = (next) => {
    setTab(next);
    setPage(1);
    setOpenId(null);
  };
  const activeFilterCount = ["store", "state", "rating", "from", "to"].filter((k) => filters[k]).length + (filters.sort !== "newest" ? 1 : 0);
  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setSearchText("");
    setQ("");
    setPage(1);
  };

  if (status === "denied") {
    return (
      <Layout back={{ to: "/employee", label: "Back to Employee Dashboard" }}>
        <p className="hero__eyebrow">Croma Feedback Dashboard</p>
        <h1 className="hero__title">Access Not Allowed</h1>
        <p className="hero__sub">You don't have permission to access this tool. Please contact the admin to request access.</p>
      </Layout>
    );
  }

  const m = data?.metrics;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const filtered = Boolean(q) || activeFilterCount > 0;
  const loading = status === "loading";

  return (
    <Layout wide back={{ to: "/employee", label: "Back to Employee Dashboard" }}>
      <h1 className="cfd__title" id="cfd-title">Croma Feedback Dashboard</h1>
      <section className="cfd" aria-labelledby="cfd-title">
        <header className="cfd__head">
          <p className="cfd__sub">Store feedback overview</p>
          <div className="cfd__head-actions">
            {data?.canArchive && (
              <div className="cfd-tabs" role="tablist" aria-label="Feedback list">
                <button role="tab" aria-selected={tab === "active"} className={`cfd-tab${tab === "active" ? " is-on" : ""}`} onClick={() => changeTab("active")}>
                  Active
                </button>
                <button role="tab" aria-selected={tab === "archived"} className={`cfd-tab${tab === "archived" ? " is-on" : ""}`} onClick={() => changeTab("archived")}>
                  Archived{m?.archived ? ` (${m.archived})` : ""}
                </button>
              </div>
            )}
            <button type="button" className="cfd-btn" onClick={load} disabled={loading} aria-label="Refresh feedback">
              <Icon>
                <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                <path d="M20 4v7h-7" />
              </Icon>
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <dl className="cfd-metrics">
          <div>
            <dt>Total Feedback</dt>
            <dd>{m ? m.total.toLocaleString("en-IN") : "—"}</dd>
          </div>
          <div>
            <dt>Average Rating</dt>
            <dd>
              {m && m.average !== null ? Number(m.average).toFixed(1) : "—"} <span>/ 5</span>
            </dd>
          </div>
          <div>
            <dt>Stores Responded</dt>
            <dd>{m ? m.stores.toLocaleString("en-IN") : "—"}</dd>
          </div>
        </dl>

        <div className="cfd-toolbar">
          <label className="cfd-search">
            <Icon>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </Icon>
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search feedback or store…"
              aria-label="Search by store name or ID, respondent, or feedback text"
              maxLength={100}
            />
          </label>
          <button type="button" className={`cfd-btn cfd-btn--filters${filtersOpen ? " is-on" : ""}`} aria-expanded={filtersOpen} aria-controls="cfd-filters" onClick={() => setFiltersOpen((o) => !o)}>
            <Icon>
              <path d="M3 5h18l-7 8v6l-4-2v-4Z" />
            </Icon>
            <span>Filters</span>
            {activeFilterCount > 0 && <b className="cfd-count">{activeFilterCount}</b>}
          </button>
        </div>

        {filtersOpen && (
          <div className="cfd-filters" id="cfd-filters">
            <label>
              <span>Store</span>
              <select value={filters.store} onChange={(e) => setFilter("store", e.target.value)}>
                <option value="">All stores</option>
                {(data?.filters.stores || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                ))}
              </select>
            </label>
            <label>
              <span>State</span>
              <select value={filters.state} onChange={(e) => setFilter("state", e.target.value)}>
                <option value="">All states</option>
                {(data?.filters.states || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Rating</span>
              <select value={filters.rating} onChange={(e) => setFilter("rating", e.target.value)}>
                <option value="">All ratings</option>
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>{r} — {RATING_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>From</span>
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter("from", e.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter("to", e.target.value)} />
            </label>
            <label>
              <span>Sort by</span>
              <select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="rating_high">Rating: high to low</option>
                <option value="rating_low">Rating: low to high</option>
              </select>
            </label>
            <button type="button" className="cfd-link" onClick={clearAll} disabled={!filtered}>
              Clear all
            </button>
          </div>
        )}

        <div className={`cfd-table${loading ? " is-loading" : ""}`} role="table" aria-label={tab === "archived" ? "Archived feedback" : "Feedback"} aria-busy={loading}>
          <div className="cfd-row cfd-row--head" role="row">
            <span role="columnheader">Date</span>
            <span role="columnheader">Store / Respondent</span>
            <span role="columnheader">Rating</span>
            <span role="columnheader">Feedback</span>
            <span role="columnheader" className="cfd-num">Comments</span>
          </div>

          {status === "error" && (
            <div className="cfd-state" role="alert">
              <p>{error || "We couldn't load the feedback."}</p>
              <button type="button" className="cfd-btn" onClick={load}>Try again</button>
            </div>
          )}

          {!data && status === "loading" &&
            [0, 1, 2, 3, 4].map((i) => (
              <div className="cfd-row cfd-row--skeleton" role="row" aria-hidden="true" key={i}>
                <span /><span /><span /><span /><span />
              </div>
            ))}

          {data && status !== "error" && data.items.length === 0 && (
            <div className="cfd-state">
              {filtered ? (
                <>
                  <p>No feedback matches your search or filters.</p>
                  <button type="button" className="cfd-btn" onClick={clearAll}>Clear search &amp; filters</button>
                </>
              ) : tab === "archived" ? (
                <p>No archived feedback.</p>
              ) : (
                <p>No feedback has been submitted yet.</p>
              )}
            </div>
          )}

          {data && status !== "error" &&
            data.items.map((it) => (
              <div
                key={it.id}
                role="row"
                tabIndex={0}
                className={`cfd-row cfd-row--item${openId === it.id ? " is-open" : ""}`}
                onClick={(e) => {
                  lastRow.current = e.currentTarget;
                  setOpenId(it.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    lastRow.current = e.currentTarget;
                    setOpenId(it.id);
                  }
                }}
              >
                <span role="cell" className="cfd-date" data-label="Date">
                  {formatDate(it.created_at)}
                  <small>{formatTime(it.created_at)}</small>
                </span>
                <span role="cell" className="cfd-store" data-label="Store / Respondent">
                  <strong>{it.store_name}</strong>
                  <small>{it.store_id}{it.state ? ` · ${it.state}` : ""} · {it.respondent_name}</small>
                </span>
                <span role="cell" data-label="Rating"><Stars value={it.rating} /></span>
                <span role="cell" className="cfd-preview" data-label="Feedback">
                  {it.preview}{it.truncated ? "…" : ""}
                </span>
                <span role="cell" className={`cfd-num${it.comment_count > 0 ? " cfd-num--has" : ""}`} data-label="Comments">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" /></svg>
                  {it.comment_count}
                  <span className="cfd-sr"> comments</span>
                </span>
              </div>
            ))}
        </div>

        <footer className="cfd-foot">
          <p>
            {data && total > 0 ? `Showing ${first}–${last} of ${total.toLocaleString("en-IN")}. ` : ""}
            Select a feedback row to open its details.
          </p>
          {pages > 1 && (
            <nav className="cfd-pager" aria-label="Pagination">
              <button type="button" className="cfd-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page} of {pages}</span>
              <button type="button" className="cfd-btn" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
            </nav>
          )}
        </footer>
      </section>

      {openId && (
        <FeedbackDrawer
          id={openId}
          onClose={() => {
            setOpenId(null);
            lastRow.current?.focus?.();
          }}
          onCommented={(id) =>
            setData((d) => d && { ...d, items: d.items.map((it) => (it.id === id ? { ...it, comment_count: it.comment_count + 1 } : it)) })
          }
          onCommentDeleted={(id) =>
            setData((d) => d && { ...d, items: d.items.map((it) => (it.id === id ? { ...it, comment_count: Math.max(0, it.comment_count - 1) } : it)) })
          }
          onArchiveChanged={(archived) => {
            setOpenId(null);
            toast(archived ? "Feedback archived" : "Feedback restored");
            load();
          }}
        />
      )}
    </Layout>
  );
}

export default function FeedbackDashboard() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}
