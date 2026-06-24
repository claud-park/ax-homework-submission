'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownView({ markdown }: { markdown: string }) {
  if (!markdown?.trim()) {
    return <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>작성된 노트가 없습니다.</p>
  }
  return (
    <div className="text-sm leading-relaxed markdown-body" style={{ color: 'var(--text-primary)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          hr: () => <hr className="my-3" style={{ borderColor: 'var(--border-subtle)' }} />,
          blockquote: ({ children }) => <blockquote className="pl-3 my-2" style={{ borderLeft: '3px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{children}</blockquote>,
          code: ({ children }) => <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--surface-secondary)' }}>{children}</code>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
