import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export function ZrSearchableSelect({
  value,
  onChange,
  options,
  ariaLabel,
  searchPlaceholder = "Rechercher…",
  minWidth = 200,
  disabled = false,
  fullWidth = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, query]);

  const selected = options.find((o) => String(o.value) === String(value)) ?? options[0];
  const label = selected?.label ?? "—";

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", minWidth: fullWidth ? 0 : minWidth, width: fullWidth ? "100%" : undefined }}
    >
      <button
        type="button"
        disabled={disabled}
        className="zr-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          width: "100%",
          minWidth: fullWidth ? 0 : minWidth,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{label}</span>
        <ChevronDown
          size={16}
          aria-hidden
          style={{
            flexShrink: 0,
            opacity: 0.8,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>
      {open ? (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 1040 }}
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            id={listId}
            role="listbox"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 1050,
              borderRadius: 8,
              border: "1px solid var(--zr-border)",
              background: "var(--zr-surface)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
              overflow: "hidden",
              minWidth: Math.max(minWidth, 240),
            }}
          >
            <div
              style={{
                padding: 8,
                borderBottom: "1px solid var(--zr-border)",
                background: "var(--zr-surface-alt)",
              }}
            >
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Search
                  size={14}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 10,
                    color: "var(--zr-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  style={{
                    width: "100%",
                    padding: "6px 10px 6px 32px",
                    borderRadius: 6,
                    border: "1px solid var(--zr-border)",
                    background: "var(--zr-surface)",
                    color: "var(--zr-text)",
                    fontSize: "0.8125rem",
                    minHeight: 34,
                    boxSizing: "border-box",
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <ul
              style={{
                maxHeight: 260,
                overflowY: "auto",
                margin: 0,
                padding: 4,
                listStyle: "none",
              }}
            >
              {filtered.map((opt) => {
                const isSel = String(opt.value) === String(value);
                return (
                  <li key={String(opt.value)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => {
                        onChange(String(opt.value));
                        setOpen(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        borderRadius: 6,
                        background: isSel ? "var(--zr-surface-alt)" : "transparent",
                        color: "var(--zr-text)",
                        fontSize: "0.875rem",
                        cursor: "pointer",
                        fontWeight: isSel ? 600 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li className="muted" style={{ padding: "12px 10px", fontSize: "0.8125rem", textAlign: "center" }}>
                  Aucun résultat.
                </li>
              ) : null}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
