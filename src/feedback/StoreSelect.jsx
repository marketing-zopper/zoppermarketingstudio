import React, { useEffect, useId, useMemo, useRef, useState } from "react";

// "ROM" is the workbook's internal region code for the rest of Maharashtra; show people a real place name.
const STATE_LABEL = { ROM: "Maharashtra", "UP East": "Uttar Pradesh", "UP West": "Uttar Pradesh" };
export const stateLabel = (s) => (s ? STATE_LABEL[s] || s : "");

const MAX_RESULTS = 60;
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const storeLabel = (s) => `${s.name} (${s.id})`;

function buildIndex(stores) {
  return stores.map((s) => ({
    s,
    id: s.id.toLowerCase(),
    name: norm(s.name),
    hay: norm(`${s.id} ${s.name} ${s.state} ${stateLabel(s.state)} ${s.address}`),
  }));
}

function search(index, query) {
  const tokens = norm(query).split(/[\s,\-–]+/).filter(Boolean);
  if (!tokens.length) return index.map((r) => r.s);
  const hits = [];
  for (const r of index) {
    if (!tokens.every((t) => r.hay.includes(t))) continue;
    // lower score = better: exact id, id prefix, name prefix, word-start in name, anything else
    const q = tokens[0];
    const score = r.id === q ? 0 : r.id.startsWith(q) ? 1 : r.name.startsWith(q) ? 2 : r.name.includes(` ${q}`) || r.name.includes(`-${q}`) ? 3 : 4;
    hits.push([score, r.s]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map((h) => h[1]);
}

export default function StoreSelect({ stores, loading, loadError, onRetry, value, onChange, error, inputId, describedBy }) {
  const uid = useId();
  const listId = `${uid}-list`;
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = useMemo(() => stores.find((s) => s.id === value) || null, [stores, value]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [touchedQuery, setTouchedQuery] = useState(false);

  const index = useMemo(() => buildIndex(stores), [stores]);
  const results = useMemo(() => search(index, touchedQuery ? text : ""), [index, text, touchedQuery]);
  const shown = results.slice(0, MAX_RESULTS);

  // keep the visible text in sync with the chosen store (e.g. after a reset)
  useEffect(() => {
    if (selected) {
      setText(storeLabel(selected));
      setTouchedQuery(false);
    } else if (!touchedQuery) setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!rootRef.current?.contains(e.target)) finish();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  });

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function finish() {
    setOpen(false);
    setText(selected ? storeLabel(selected) : "");
    setTouchedQuery(false);
  }

  function pick(s) {
    onChange(s.id);
    setText(storeLabel(s));
    setTouchedQuery(false);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      finish();
    } else if (e.key === "Tab" && open) {
      finish();
    }
  }

  const disabled = loading || (!!loadError && !stores.length);
  const placeholder = loading ? "Loading stores…" : loadError && !stores.length ? "Stores unavailable" : "Select your croma store";

  return (
    <div className="fb-select" ref={rootRef}>
      <div className={`fb-control fb-select__box${error ? " is-invalid" : ""}`}>
        <input
          ref={inputRef}
          id={inputId || `${uid}-input`}
          data-field="storeId"
          className="fb-select__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${uid}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onFocus={(e) => {
            setOpen(true);
            if (selected) e.target.select();
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setTouchedQuery(true);
            setActive(0);
            setOpen(true);
            if (selected) onChange(""); // editing the text un-selects the store
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          className="fb-select__caret"
          aria-label={open ? "Close store list" : "Open store list"}
          disabled={disabled}
          onClick={() => {
            if (open) finish();
            else {
              setOpen(true);
              inputRef.current?.focus();
            }
          }}
        >
          <svg viewBox="0 0 16 10" aria-hidden="true"><path d="M1 1h14L8 9z" fill="currentColor" /></svg>
        </button>
      </div>

      {open && !disabled && (
        <ul className="fb-select__list" id={listId} role="listbox" aria-label="Croma stores" ref={listRef}>
          {shown.length === 0 && <li className="fb-select__empty" role="presentation">No store matches “{text}”. Try the store name, ID or city.</li>}
          {shown.map((s, i) => (
            <li
              key={s.id}
              id={`${uid}-opt-${i}`}
              data-i={i}
              role="option"
              aria-selected={s.id === value}
              className={`fb-select__opt${i === active ? " is-active" : ""}${s.id === value ? " is-selected" : ""}`}
              onPointerDown={(e) => e.preventDefault() /* keep input focus until we pick */}
              onClick={() => pick(s)}
              onMouseMove={() => i !== active && setActive(i)}
            >
              <span className="fb-select__name">{s.name}</span>
              <span className="fb-select__meta">
                {s.id}
                {s.state ? ` · ${stateLabel(s.state)}` : ""}
              </span>
            </li>
          ))}
          {results.length > shown.length && (
            <li className="fb-select__more" role="presentation">
              Showing {shown.length} of {results.length} stores — keep typing to narrow it down.
            </li>
          )}
        </ul>
      )}

      {loadError && !loading && (
        <p className="fb-hint">
          {loadError}{" "}
          <button type="button" className="fb-linkbtn" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
