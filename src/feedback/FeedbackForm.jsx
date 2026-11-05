import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import StoreSelect from "./StoreSelect.jsx";
import DeskCharacter from "./DeskCharacter.jsx";
import { LIMITS, RATING_LABELS, cleanPhone, validateFeedback } from "../../shared/feedbackRules.js";
import "./feedback.css";

const A = "/feedback"; // static artwork extracted from the approved design

// Face buttons are baked into the artwork; these are their hit areas as % of the (trimmed) panel image.
const FACES = [
  { v: 1, l: 9.02, w: 16.27 },
  { v: 2, l: 25.67, w: 15.9 },
  { v: 3, l: 42.31, w: 15.53 },
  { v: 4, l: 58.58, w: 15.53 },
  { v: 5, l: 74.85, w: 15.16 },
];

const newKey = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 3) | 8).toString(16);
      });

const EMPTY = { name: "", storeId: "", phone: "", feedback: "", rating: 0 };
const ORDER = ["name", "storeId", "phone", "feedback", "rating"];

function useStores() {
  const [state, setState] = useState({ stores: [], loading: true, error: "" });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const res = await fetch("/api/feedback/stores");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.stores)) throw new Error(data.error || "bad response");
      setState({ stores: data.stores, loading: false, error: "" });
    } catch {
      setState((s) => ({ ...s, loading: false, error: "We couldn't load the store list." }));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

export default function FeedbackForm() {
  const { stores, loading, error: storesError, reload } = useStores();
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(null); // { rating } after a successful save
  const keyRef = useRef(newKey());
  const inFlight = useRef(false);
  const formRef = useRef(null);
  const charRef = useRef(null);

  // page-only font + title; restored when leaving
  useEffect(() => {
    const prev = document.title;
    document.title = "Croma × Zopper · Feedback Desk";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Jersey+10&display=swap";
    document.head.appendChild(link);
    return () => {
      document.title = prev;
      link.remove();
    };
  }, []);

  const knownIds = useMemo(() => new Set(stores.map((s) => s.id)), [stores]);
  const { errors: liveErrors } = useMemo(
    () => validateFeedback(values, { isKnownStore: stores.length ? (id) => knownIds.has(id) : undefined }),
    [values, knownIds, stores.length],
  );
  const errorFor = (f) => (touched[f] || touched.__all ? serverErrors[f] || liveErrors[f] : serverErrors[f]) || "";

  const set = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setServerErrors((e) => (e[field] || e.form ? { ...e, [field]: undefined, form: undefined } : e));
    setFormError("");
  };
  const blur = (f) => setTouched((t) => ({ ...t, [f]: true }));

  function focusField(field) {
    const root = formRef.current;
    if (!root) return;
    const el =
      field === "rating"
        ? root.querySelector(".fb-rate input:checked, .fb-rate input")
        : root.querySelector(`[data-field="${field}"]`);
    el?.focus({ preventScroll: false });
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (inFlight.current) return; // prevents double submission
    setTouched((t) => ({ ...t, __all: true }));
    const { errors } = validateFeedback(values, { isKnownStore: stores.length ? (id) => knownIds.has(id) : undefined });
    const first = ORDER.find((f) => errors[f]);
    if (first) {
      setFormError("");
      focusField(first);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setFormError("");
    try {
      const form = new FormData(formRef.current);
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website: form.get("website") || "", submissionKey: keyRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDone({ rating: values.rating });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (res.status === 400 && data.fields) {
        setServerErrors(data.fields);
        const f = ORDER.find((k) => data.fields[k]);
        if (f) focusField(f);
        else setFormError(data.fields.form || data.error || "Please check your answers and try again.");
      } else {
        setFormError(data.error || "We couldn't save your feedback. Please try again.");
      }
    } catch {
      setFormError("We couldn't reach the server. Check your connection — your answers are still here.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function again() {
    keyRef.current = newKey();
    setValues(EMPTY);
    setTouched({});
    setServerErrors({});
    setFormError("");
    setDone(null);
  }

  const err = {
    name: errorFor("name"),
    storeId: errorFor("storeId"),
    phone: errorFor("phone"),
    feedback: errorFor("feedback"),
    rating: errorFor("rating"),
  };
  const fbLen = [...values.feedback].length;

  return (
    <div className="fb-page">
      <div className="fb-col">
        <div className="fb-stage">
          <header className="fb-header">
            <img className="fb-header__zopper" src={`${A}/zopper-white.png`} alt="Zopper" />
            <img className="fb-header__croma" src={`${A}/croma-header.png`} alt="Croma" />
          </header>

          <section className="fb-scene" aria-hidden="false">
            <img className="fb-scene__croma" src={`${A}/croma-navy.png`} alt="" aria-hidden="true" />
            <DeskCharacter ref={charRef} />
            <p className="fb-bubble" aria-hidden="true">How can we<br />support your<br />store better?</p>
            <img className="fb-scene__desk" src={`${A}/desk-sign.webp`} alt="" width="900" height="269" />
            <span className="fb-scene__patch" aria-hidden="true" />
            <img className="fb-scene__lockup" src={`${A}/zopper-white.png`} alt="" aria-hidden="true" />
            <p className="fb-scene__sign">Feedback Desk<span className="fb-sr"> — Zopper</span></p>
          </section>

          {done ? (
            <Thanks rating={done.rating} onAgain={again} />
          ) : (
            <form ref={formRef} className="fb-form" onSubmit={onSubmit} noValidate aria-labelledby="fb-title">
              <section className="fb-card"><div className="fb-card__inner">
                <h1 id="fb-title" className="fb-card__title">A quick check-in from<br />the store floor.</h1>

                <div className="fb-field">
                  <label className="fb-label" htmlFor="fb-name">Name</label>
                  <input
                    id="fb-name"
                    data-field="name"
                    className={`fb-control${err.name ? " is-invalid" : ""}`}
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Enter your name"
                    maxLength={LIMITS.nameMax + 20}
                    value={values.name}
                    onChange={(e) => set("name", e.target.value)}
                    onBlur={() => blur("name")}
                    aria-invalid={err.name ? true : undefined}
                    aria-describedby={err.name ? "fb-name-err" : undefined}
                  />
                  <FieldError id="fb-name-err" msg={err.name} />
                </div>

                <div className="fb-field" data-field="storeId-wrap">
                  <label className="fb-label" id="fb-store-label" htmlFor="fb-store">Croma Store</label>
                  <div onBlur={() => blur("storeId")}>
                    <StoreSelect
                      inputId="fb-store"
                      stores={stores}
                      loading={loading}
                      loadError={storesError}
                      onRetry={reload}
                      value={values.storeId}
                      onChange={(id) => set("storeId", id)}
                      error={err.storeId}
                      describedBy={err.storeId ? "fb-store-err" : undefined}
                    />
                  </div>
                  <FieldError id="fb-store-err" msg={err.storeId} />
                </div>

                <div className="fb-field">
                  <label className="fb-label" htmlFor="fb-phone">Contact Number</label>
                  <div className={`fb-phone${err.phone ? " is-invalid" : ""}`}>
                    <span className="fb-phone__prefix" aria-hidden="true">+91</span>
                    <input
                      id="fb-phone"
                      data-field="phone"
                      className="fb-phone__input"
                      type="tel"
                      name="phone"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="Enter your mobile number"
                      value={values.phone}
                      onChange={(e) => set("phone", cleanPhone(e.target.value).slice(0, 10))}
                      onBlur={() => blur("phone")}
                      aria-label="Mobile number, 10 digits, after +91"
                      aria-invalid={err.phone ? true : undefined}
                      aria-describedby={err.phone ? "fb-phone-err" : undefined}
                    />
                  </div>
                  <FieldError id="fb-phone-err" msg={err.phone} />
                </div>

                <div className="fb-field">
                  <label className="fb-label" htmlFor="fb-feedback">Your feedback to Zopper&apos;s Senior Management</label>
                  <textarea
                    id="fb-feedback"
                    data-field="feedback"
                    className={`fb-control fb-textarea${err.feedback ? " is-invalid" : ""}`}
                    name="feedback"
                    rows={6}
                    placeholder="your thoughts here...."
                    value={values.feedback}
                    onChange={(e) => set("feedback", e.target.value)}
                    onBlur={() => blur("feedback")}
                    aria-invalid={err.feedback ? true : undefined}
                    aria-describedby={err.feedback ? "fb-feedback-err" : "fb-feedback-count"}
                  />
                  <div className="fb-field__foot">
                    <FieldError id="fb-feedback-err" msg={err.feedback} />
                    <span id="fb-feedback-count" className={`fb-count${fbLen > LIMITS.feedbackMax ? " is-over" : ""}`}>
                      {fbLen}/{LIMITS.feedbackMax}
                    </span>
                  </div>
                </div>

                {/* honeypot: invisible to people, irresistible to bots */}
                <div className="fb-hp" aria-hidden="true">
                  <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
                </div>
              </div></section>

              <section className="fb-bottom">
                <div className="fb-rate-note" role="status" aria-live="polite">
                  {err.rating ? <span className="fb-rate-note__error">{err.rating}</span> : values.rating ? <span className="fb-sr">You picked {RATING_LABELS[values.rating]}</span> : null}
                </div>

                <div className="fb-floor">
                <div className="fb-counter" aria-hidden="true" />
                <img className="fb-plant fb-plant--l" src={`${A}/plant.webp`} alt="" aria-hidden="true" />
                <img className="fb-plant fb-plant--r" src={`${A}/plant.webp`} alt="" aria-hidden="true" />

                <fieldset className={`fb-rate${err.rating ? " is-invalid" : ""}${values.rating ? " has-value" : ""}`}>
                  <legend className="fb-sr">Rate your experience with Zopper. Choose one rating from 1 to 5.</legend>
                  <img className="fb-rate__img" src={`${A}/rating-panel.webp`} alt="" width="1000" height="530" />
                  <div className={`fb-rate__screen fb-rate__screen--${values.rating}`} aria-hidden="true">
                    {values.rating > 0 ? (
                      <>
                        <span className="fb-rate__screen-hint">You picked</span>
                        <span className="fb-rate__screen-label">{RATING_LABELS[values.rating]}</span>
                      </>
                    ) : (
                      <span className="fb-rate__screen-label">Rate your experience with Zopper</span>
                    )}
                  </div>
                  {FACES.map((f) => (
                    <label
                      key={f.v}
                      className={`fb-rate__face${values.rating === f.v ? " is-selected" : ""}`}
                      style={{ left: `${f.l}%`, width: `${f.w}%` }}
                    >
                      <input
                        type="radio"
                        name="rating"
                        value={f.v}
                        checked={values.rating === f.v}
                        onClick={() => charRef.current?.nod()}
                        onChange={() => {
                          set("rating", f.v);
                          blur("rating");
                        }}
                      />
                      <span className="fb-sr">{f.v} out of 5 — {RATING_LABELS[f.v]}</span>
                      <span className="fb-rate__ring" aria-hidden="true" />
                      <span className="fb-rate__tick" aria-hidden="true">✓</span>
                    </label>
                  ))}
                </fieldset>

                {formError && (
                  <p className="fb-formerror" role="alert">
                    {formError}
                  </p>
                )}

                <button type="submit" className="fb-submit" disabled={submitting} aria-busy={submitting}>
                  {submitting ? (
                    <>
                      <span className="fb-spinner" aria-hidden="true" /> Saving…
                    </>
                  ) : (
                    <>
                      Share Feedback <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>
                </div>
              </section>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldError({ id, msg }) {
  return (
    <p id={id} className="fb-error" role={msg ? "alert" : undefined} hidden={!msg}>
      {msg}
    </p>
  );
}

function Thanks({ rating, onAgain }) {
  const face = FACES.find((f) => f.v === rating);
  return (
    <section className="fb-form">
      <div className="fb-card fb-thanks" role="status"><div className="fb-card__inner">
        <div className="fb-thanks__badge" aria-hidden="true">✓</div>
        <h1 className="fb-card__title">Thank you!</h1>
        <p className="fb-thanks__text">
          Your feedback has been received. We read every note and use it to enhance customer experience.
        </p>
        {face && (
          <p className="fb-thanks__rating">
            Your rating: <strong>{RATING_LABELS[face.v]}</strong> ({face.v}/5)
          </p>
        )}
        <button type="button" className="fb-submit fb-submit--inline" onClick={onAgain}>
          Share more feedback <span aria-hidden="true">→</span>
        </button>
      </div></div>
    </section>
  );
}
