'use client'

export type PublishFilterValue = 'all' | 'published' | 'draft'

const OPTIONS: { value: PublishFilterValue; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'published', label: '게시됨' },
  { value: 'draft', label: '임시저장' },
]

export function PublishStatusFilter({
  value,
  onChange,
}: {
  value: PublishFilterValue
  onChange: (v: PublishFilterValue) => void
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '2px',
      }}
    >
      {OPTIONS.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '6px',
              background: active ? 'var(--surface-primary)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
