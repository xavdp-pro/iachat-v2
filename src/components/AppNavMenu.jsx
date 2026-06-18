import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { COMMERCIAL_SECTIONS } from '../config/navigation.js'

/** Compact app menu for workflow pages (stepper, grid toolbar). */
export default function AppNavMenu({ buttonStyle, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const links = COMMERCIAL_SECTIONS.flatMap(section => section.items).filter(item => item.to !== '/')

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={ref} className="app-nav-menu" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        style={buttonStyle}
        title="Menu applications"
        aria-label="Menu applications"
        aria-expanded={open}
      >
        <Menu size={15} />
      </button>
      {open && (
        <div className={`app-nav-menu-popover app-nav-menu-popover--${align}`} role="menu">
          <div className="app-nav-menu-popover-title">Applications</div>
          {links.map(item => (
            <Link key={item.to} to={item.to} className="app-nav-menu-popover-item" role="menuitem" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
