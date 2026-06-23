'use client'

interface Props {
  value: 30 | 60
  onChange: (v: 30 | 60) => void
}

export function DurationToggle({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 mb-4">
      {([30, 60] as const).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            background: value === d ? 'var(--blue-600)' : 'var(--surface-secondary)',
            color:      value === d ? '#fff' : 'var(--text-secondary)',
            border:     value === d ? 'none' : '1px solid var(--border-subtle)',
            cursor:     'pointer',
          }}
        >
          {d}분
        </button>
      ))}
    </div>
  )
}
