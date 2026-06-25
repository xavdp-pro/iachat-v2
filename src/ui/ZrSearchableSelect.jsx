import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export function ZrSearchableSelect({
  value,
  onChange,
  options,
  ariaLabel,
  searchPlaceholder = 'Rechercher…',
  minWidth = 200,
  disabled = false,
  fullWidth = false,
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPos, setMenuPos] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const searchRef = useRef(null)
  const listId = useId()

  const updateMenuPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, minWidth, 240),
    })
  }

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    const t = window.setTimeout(() => searchRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return undefined
    updateMenuPos()
    const onLayout = () => updateMenuPos()
    window.addEventListener('scroll', onLayout, true)
    window.addEventListener('resize', onLayout)
    return () => {
      window.removeEventListener('scroll', onLayout, true)
      window.removeEventListener('resize', onLayout)
    }
  }, [open, minWidth])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => String(o.label).toLowerCase().includes(q))
  }, [options, query])

  const selected = options.find((o) => String(o.value) === String(value)) ?? options[0]
  const label = selected?.label ?? '—'
  const sizeClass = size === 'sm' ? 'zr-select-trigger--sm' : ''

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', minWidth: fullWidth ? 0 : minWidth, width: fullWidth ? '100%' : undefined }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`zr-select-trigger ${sizeClass}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return
          if (!open) updateMenuPos()
          setOpen((o) => !o)
        }}
        style={{
          width: '100%',
          minWidth: fullWidth ? 0 : minWidth,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
        <ChevronDown
          size={size === 'sm' ? 14 : 16}
          aria-hidden
          className="zr-select-chevron"
          style={{
            flexShrink: 0,
            opacity: 0.75,
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>
      {open && menuPos ? (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1990 }}
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            id={listId}
            role="listbox"
            className="zr-select-listbox"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 2000,
              overflow: 'hidden',
            }}
          >
            <div className="zr-select-search-wrap">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search
                  size={14}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 10,
                    color: 'var(--color-text-3)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="zr-select-search"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <ul
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                margin: 0,
                padding: 4,
                listStyle: 'none',
              }}
            >
              {filtered.map((opt) => {
                const isSel = String(opt.value) === String(value)
                return (
                  <li key={String(opt.value)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      className="zr-select-option"
                      onClick={() => {
                        onChange(String(opt.value))
                        setOpen(false)
                      }}
                    >
                      {opt.label}
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 ? (
                <li className="zr-select-empty">Aucun résultat.</li>
              ) : null}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  )
}
