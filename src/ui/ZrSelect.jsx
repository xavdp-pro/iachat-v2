import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export function ZrSelect({ value, onChange, options, ariaLabel, minWidth = 160, disabled = false, fullWidth = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

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

  const selected = options.find((o) => String(o.value) === String(value)) ?? options[0];
  const label = selected?.label ?? "—";

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        minWidth: fullWidth ? 0 : minWidth,
        width: fullWidth ? "100%" : undefined,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="zr-select-trigger"
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
          <ul
            id={listId}
            role="listbox"
            className="zr-select-listbox"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              zIndex: 1050,
              maxHeight: 280,
              overflowY: "auto",
              borderRadius: 8,
              border: "1px solid var(--zr-border)",
              background: "var(--zr-surface)",
              padding: 4,
              listStyle: "none",
              margin: 0,
            }}
          >
            {options.map((opt) => {
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
          </ul>
        </>
      ) : null}
    </div>
  );
}
