'use client'
import type { WeeklyChampionUpdateWithSession } from '@/lib/types'
import { MarkdownView } from '@/components/MarkdownView'

interface Props {
  updates: WeeklyChampionUpdateWithSession[]
}

export function AdminWeeklyProgressList({ updates }: Props) {
  if (updates.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>
        아직 동기화된 Weekly 진척도가 없습니다.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {updates.map((u) => (
        <div
          key={u.id}
          className="rounded-lg border p-3"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}
        >
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {u.weekly_session.session_date}
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--text-disabled)' }}>
              {u.weekly_session.title}
            </span>
          </div>
          {u.project_label && (
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {u.project_label}
            </p>
          )}
          <MarkdownView markdown={u.summary} />
        </div>
      ))}
    </div>
  )
}
