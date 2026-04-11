import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { Maximize2, X } from 'lucide-react'

// Minimal theme that inherits CSS variables instead of hardcoded colors
const codeStyle = {
  'code[class*="language-"]': {
    color: 'var(--md-code-text)',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
  },
  'pre[class*="language-"]': {
    background: 'var(--md-code-block-bg)',
    borderRadius: '6px',
    padding: '1rem',
    overflowX: 'auto',
    margin: 0,
  },
  '.token.comment, .token.prolog, .token.doctype, .token.cdata': { color: 'var(--md-token-comment)' },
  '.token.punctuation': { color: 'var(--md-token-punctuation)' },
  '.token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted': { color: 'var(--md-token-number)' },
  '.token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted': { color: 'var(--md-token-string)' },
  '.token.operator, .token.entity, .token.url': { color: 'var(--md-token-text)' },
  '.token.atrule, .token.attr-value, .token.keyword': { color: 'var(--md-token-keyword)' },
  '.token.function, .token.class-name': { color: 'var(--md-token-function)' },
  '.token.regex, .token.important, .token.variable': { color: 'var(--md-token-variable)' },
}

export function MarkdownRenderer({ content, streaming = false }) {
  return (
    <div className={`chat-md-body${streaming ? ' chat-md-body--streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  style={codeStyle}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              )
            }
            return (
              <code className={`chat-md-inline-code${className ? ' ' + className : ''}`} {...props}>
                {children}
              </code>
            )
          },
          // Open links in new tab safely
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            )
          },
          // Tables : scrollable inline + bouton expand vers tiroir overlay
          table({ children }) {
            return <TableExpand>{children}</TableExpand>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ── Tiroir tableau ─────────────────────────────────────────────────────────
function TableExpand({ children }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ margin: '0.75em 0' }}>
      {/* Bouton expand — au-dessus du tableau, aligné à droite */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          onClick={() => setOpen(true)}
          title="Agrandir le tableau"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: '5px',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-primary)',
            fontSize: '10px', fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Maximize2 size={10} /> Agrandir
        </button>
      </div>

      {/* Inline table: horizontal scroll; min-width keeps columns readable */}
      <div className="chat-md-table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: '0.875em' }}>
          {children}
        </table>
      </div>

      {/* Tiroir overlay */}
      {open && createPortal(
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 1200,
              animation: 'fadeInBackdrop 0.2s ease',
            }}
          />
          {/* Panneau */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 'min(72vw, 1000px)',
            background: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            zIndex: 1201,
            display: 'flex', flexDirection: 'column',
            animation: 'slideInDrawer 0.22s ease',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          }}>
            {/* Header tiroir */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Maximize2 size={13} color="var(--color-primary)" /> Tableau
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 6, borderRadius: '6px', border: 'none',
                  background: 'transparent', color: 'var(--color-text-3)',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-input-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <X size={15} />
              </button>
            </div>

            {/* Contenu : tableau scroll */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '16px 20px' }}>
              <table className="chat-md-table-expanded" style={{
                borderCollapse: 'collapse',
                minWidth: '100%',
                fontSize: '0.875rem',
                whiteSpace: 'nowrap',
              }}>
                {children}
              </table>
            </div>
          </div>

          <style>{`
            @keyframes fadeInBackdrop { from { opacity: 0 } to { opacity: 1 } }
            @keyframes slideInDrawer  { from { transform: translateX(100%) } to { transform: translateX(0) } }
            .chat-md-table-expanded th,
            .chat-md-table-expanded td {
              border: 1px solid var(--color-border);
              padding: 0.45em 0.9em;
              text-align: left;
            }
            .chat-md-table-expanded th {
              background: var(--md-table-head-bg);
              font-weight: 600;
            }
            .chat-md-table-expanded tr:nth-child(even) td {
              background: var(--md-table-row-alt);
            }
          `}</style>
        </>,
        document.body
      )}
    </div>
  )
}
