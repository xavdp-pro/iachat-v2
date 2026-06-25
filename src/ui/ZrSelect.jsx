import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function ZrSelect({
  value,
  onChange,
  options,
  ariaLabel,
  minWidth = 160,
  disabled = false,
  fullWidth = false,
  size = 'md',
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listId = useId()

  const updateMenuPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, minWidth),
    })
  }

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

  const selected = options.find((o) => String(o.value) === String(value)) ?? options[0]
  const label = selected?.label ?? '—'
  const sizeClass = size === 'sm' ? 'zr-select-trigger--sm' : ''

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        minWidth: fullWidth ? 0 : minWidth,
        width: fullWidth ? '100%' : undefined,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return
          if (!open) updateMenuPos()
          setOpen((o) => !o)
        }}
        className={`zr-select-trigger ${sizeClass}`.trim()}
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
          <ul
            id={listId}
            role="listbox"
            className="zr-select-listbox"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 2000,
              maxHeight: 280,
              overflowY: 'auto',
              margin: 0,
              padding: 4,
              listStyle: 'none',
            }}
          >
            {options.map((opt) => {
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
          </ul>
        </>
      ) : null}
    </div>
  )
}
