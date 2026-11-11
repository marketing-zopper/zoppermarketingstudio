import React, { useEffect, useRef, useState } from "react";
import { api } from "../admin/api.js";
import Stars from "./Stars.jsx";
import { RATING_LABELS, formatDateTime, formatPhone } from "./format.js";

const COMMENT_MAX = 1000;

export default function FeedbackDrawer({ id, onClose, onCommented, onCommentDeleted, onArchiveChanged }) {
  const [item, setItem] = useState(null);
  const [perms, setPerms] = useState({ canComment: false, canArchive: false });
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // comment id awaiting confirmation
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const closeRef = useRef(null);
  const listEnd = useRef(null);

  async function load() {
    setStatus("loading");
    setError("");
    try {
      const res = await api.feedbackItem(id);
      setItem(res.item);
      setPerms({ canComment: res.canComment, canArchive: res.canArchive });
      setStatus("ready");
    } catch (err) {
      if (err.status === 401) return;
      setError(err.status === 404 ? "This feedback isn't available." : err.message);
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The parent re-renders (and passes a new onClose) while the drawer is open; keep the latest in a ref so
  // the effect below runs once and never steals focus from the comment box.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind the panel doesn't scroll
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  async function post(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setPostError("");
    try {
      const { comment } = await api.feedbackComment(id, body);
      setItem((it) => ({ ...it, comments: [...it.comments, comment] }));
      setDraft("");
      onCommented(id);
      setTimeout(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
    } catch (err) {
      setPostError(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function removeComment(commentId) {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.feedbackDeleteComment(commentId);
      setItem((it) => ({ ...it, comments: it.comments.filter((c) => c.id !== commentId) }));
      setConfirmDelete(null);
      onCommentDeleted(id);
    } catch (err) {
      if (err.status === 404) {
        // already gone (deleted elsewhere): just drop it from the list
        setItem((it) => ({ ...it, comments: it.comments.filter((c) => c.id !== commentId) }));
        setConfirmDelete(null);
        onCommentDeleted(id);
      } else {
        setDeleteError(err.message);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function setArchived(archived) {
    setArchiving(true);
    setArchiveError("");
    try {
      await api.feedbackArchive(id, archived);
      onArchiveChanged(archived);
    } catch (err) {
      setArchiveError(err.message);
      setArchiving(false);
    }
  }

  const over = [...draft].length > COMMENT_MAX;

  return (
    <div className="cfd-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="cfd-drawer" role="dialog" aria-modal="true" aria-labelledby="cfd-drawer-title">
        <header className="cfd-drawer__head">
          <div>
            <p className="cfd-eyebrow">Feedback details</p>
            <h2 id="cfd-drawer-title">{item ? item.store.name : "Loading…"}</h2>
          </div>
          <button type="button" className="cfd-icon-btn" onClick={onClose} ref={closeRef} aria-label="Close details">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div className="cfd-drawer__body">
          {status === "loading" && (
            <div className="cfd-skel" aria-busy="true" aria-label="Loading feedback">
              <span /><span /><span /><span />
            </div>
          )}

          {status === "error" && (
            <div className="cfd-state" role="alert">
              <p>{error}</p>
              <button type="button" className="cfd-btn" onClick={load}>Try again</button>
            </div>
          )}

          {status === "ready" && item && (
            <>
              <div className="cfd-meta-row">
                <Stars value={item.rating} />
                <span>{RATING_LABELS[item.rating]}</span>
                {item.archived && <span className="cfd-tag">Archived</span>}
              </div>

              <section>
                <h3>Feedback</h3>
                <p className="cfd-quote">{item.feedback}</p>
              </section>

              <section>
                <h3>Details</h3>
                <dl className="cfd-facts">
                  <div><dt>Respondent</dt><dd>{item.respondent_name}</dd></div>
                  <div><dt>Phone number</dt><dd><a href={`tel:${item.phone_number}`}>{formatPhone(item.phone_number)}</a></dd></div>
                  <div><dt>Store</dt><dd>{item.store.name}</dd></div>
                  <div><dt>Store ID</dt><dd>{item.store.id}</dd></div>
                  <div className="cfd-facts__wide"><dt>Location</dt><dd>{[item.store.address, item.store.state].filter(Boolean).join(", ")}</dd></div>
                  <div className="cfd-facts__wide"><dt>Submitted</dt><dd>{formatDateTime(item.created_at)}</dd></div>
                </dl>
              </section>

              <section>
                <h3>Internal comments <span className="cfd-badge">{item.comments.length}</span></h3>
                {item.comments.length === 0 ? (
                  <p className="cfd-muted">No comments yet.</p>
                ) : (
                  <ul className="cfd-comments">
                    {item.comments.map((c) => (
                      <li key={c.id}>
                        <div className="cfd-comments__top">
                          <strong title={c.author_email}>{c.author_name}</strong>
                          <time dateTime={c.created_at}>{formatDateTime(c.created_at)}</time>
                        </div>
                        <p>{c.body}</p>
                        {c.canDelete &&
                          (confirmDelete === c.id ? (
                            <div className="cfd-comment-confirm" role="group" aria-label="Confirm comment deletion">
                              <span>Delete this comment?</span>
                              <button type="button" className="cfd-btn cfd-btn--danger cfd-btn--sm" disabled={deleting} onClick={() => removeComment(c.id)}>
                                {deleting ? "Deleting…" : "Delete"}
                              </button>
                              <button type="button" className="cfd-btn cfd-btn--sm" disabled={deleting} onClick={() => { setConfirmDelete(null); setDeleteError(""); }}>
                                Cancel
                              </button>
                              {deleteError && <span className="cfd-error" role="alert">{deleteError}</span>}
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="cfd-comment-delete"
                              onClick={() => { setConfirmDelete(c.id); setDeleteError(""); }}
                              aria-label={`Delete comment by ${c.author_name}`}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                              Delete
                            </button>
                          ))}
                      </li>
                    ))}
                  </ul>
                )}
                <span ref={listEnd} />

                {perms.canComment && !item.archived && (
                  <form className="cfd-composer" onSubmit={post}>
                    <label htmlFor="cfd-comment" className="cfd-sr">Add an internal comment</label>
                    <textarea
                      id="cfd-comment"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      placeholder="Add an internal comment (visible to the team, not to the store)…"
                      aria-invalid={over || undefined}
                    />
                    <div className="cfd-composer__row">
                      <span className={`cfd-muted${over ? " is-over" : ""}`}>{[...draft].length}/{COMMENT_MAX}</span>
                      <button className="cfd-btn cfd-btn--primary" disabled={posting || !draft.trim() || over}>
                        {posting ? "Posting…" : "Add comment"}
                      </button>
                    </div>
                    {postError && <p className="cfd-error" role="alert">{postError}</p>}
                  </form>
                )}
                {item.archived && (
                  <p className="cfd-muted">This feedback is archived. Restore it to add comments.</p>
                )}
              </section>

              {perms.canArchive && (
                <section className="cfd-archive">
                  <h3>{item.archived ? "Restore" : "Archive"}</h3>
                  {item.archived ? (
                    <p className="cfd-muted">
                      Archived by {item.archived_by} on {formatDateTime(item.archived_at)}. Restoring returns it to the active feed.
                    </p>
                  ) : (
                    <p className="cfd-muted">Archiving removes this feedback from the active feed. The feedback and its comments are kept and can be restored.</p>
                  )}
                  {!confirming ? (
                    <button type="button" className="cfd-btn" onClick={() => setConfirming(true)}>
                      {item.archived ? "Restore feedback" : "Archive feedback"}
                    </button>
                  ) : (
                    <div className="cfd-confirm">
                      <span>{item.archived ? "Restore this feedback?" : "Archive this feedback?"}</span>
                      <button type="button" className="cfd-btn cfd-btn--primary" disabled={archiving} onClick={() => setArchived(!item.archived)}>
                        {archiving ? "Working…" : "Confirm"}
                      </button>
                      <button type="button" className="cfd-btn" disabled={archiving} onClick={() => setConfirming(false)}>Cancel</button>
                    </div>
                  )}
                  {archiveError && <p className="cfd-error" role="alert">{archiveError}</p>}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
