import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'

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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
