'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CHARTER_GUIDE_MD } from '@/lib/charter-guide-content'
import type { Components } from 'react-markdown'

const components: Components = {
  h1: ({ children }) => (
    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, marginTop: 0, lineHeight: 1.3 }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 28, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-600)', marginTop: 20, marginBottom: 4 }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-secondary)', margin: '6px 0' }}>
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ color: 'var(--text-disabled)', fontStyle: 'normal', fontSize: 12 }}>{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid var(--blue-600)',
      margin: '10px 0',
      padding: '8px 12px',
      background: 'rgba(37,99,235,0.04)',
      borderRadius: '0 6px 6px 0',
    }}>
      <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{children}</div>
    </blockquote>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'var(--surface-secondary)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th style={{
      textAlign: 'left',
      padding: '8px 12px',
      fontWeight: 600,
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-subtle)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{
      padding: '7px 12px',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-subtle)',
      verticalAlign: 'top',
    }}>
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>{children}</tr>
  ),
  ul: ({ children }) => (
    <ul style={{ paddingLeft: 18, margin: '6px 0', listStyleType: 'disc' }}>{children}</ul>
  ),
  li: ({ children }) => (
    <li style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-secondary)', marginBottom: 2 }}>{children}</li>
  ),
  code: ({ children }) => (
    <code style={{
      background: 'var(--surface-secondary)',
      borderRadius: 4,
      padding: '1px 5px',
      fontSize: 12,
      color: 'var(--blue-600)',
      fontFamily: 'monospace',
    }}>
      {children}
    </code>
  ),
}

export default function CharterGuidePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'hsl(var(--background))',
      fontFamily: "Pretendard, 'Apple SD Gothic Neo', system-ui, sans-serif",
    }}>
      <div style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: '36px 40px 60px',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 20,
          padding: '4px 10px',
          borderRadius: 20,
          background: 'rgba(37,99,235,0.08)',
          border: '1px solid rgba(37,99,235,0.2)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue-600)', letterSpacing: '0.05em' }}>
            AX Office · 가이드
          </span>
        </div>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {CHARTER_GUIDE_MD}
        </ReactMarkdown>
      </div>
    </div>
  )
}
