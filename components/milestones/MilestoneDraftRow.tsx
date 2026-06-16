'use client'
import DateRangePicker from '@/components/DateRangePicker'

export interface DraftMilestone {
  tempId: string
  title: string
  description?: string
  start_date: string | null
  due_date: string | null
  source: 'manual' | 'ai' | 'template'
  children?: DraftMilestone[]
}

const INPUT: React.CSSProperties = {
  fontSize: 13, padding: '6px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', width: '100%',
}

export default function MilestoneDraftRow({
  row, isChild = false, onChange, onRemove,
}: {
  row: DraftMilestone
  isChild?: boolean
  onChange: (next: DraftMilestone) => void
  onRemove: () => void
}) {
  const titleError = !row.title.trim()
  return (
    <div className="flex flex-col gap-2 py-2" style={{ paddingLeft: isChild ? 20 : 0 }}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={row.title}
          onChange={e => onChange({ ...row, title: e.target.value })}
          placeholder={isChild ? '서브 마일스톤 이름' : '마일스톤 이름'}
          style={{ ...INPUT, borderColor: titleError ? 'var(--error)' : 'var(--border)' }}
        />
        <button type="button" onClick={onRemove} aria-label="삭제"
          className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-secondary)' }}>✕</button>
      </div>
      <DateRangePicker
        startDate={row.start_date ?? ''}
        endDate={row.due_date ?? ''}
        onChange={(s, e) => onChange({ ...row, start_date: s || null, due_date: e || null })}
      />
    </div>
  )
}
