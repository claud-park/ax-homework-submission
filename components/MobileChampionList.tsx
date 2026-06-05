'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChampionSummary, MilestoneStatus } from '@/lib/types'

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  completed: '#22c55e',
  in_progress: '#3b82f6',
  delayed: '#ef4444',
  not_started: '#94a3b8',
}
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  completed: '완료', in_progress: '진행', delayed: '지연', not_started: '미시작',
}

interface Props {
  initialData: ChampionSummary[]
}

export function MobileChampionList({ initialData }: Props) {
  const router = useRouter()
  const [champions, setChampions] = useState<ChampionSummary[]>(initialData)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = champions.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.department.toLowerCase().includes(query.toLowerCase())
  )

  if (error) {
    return (
      <div className="text-sm text-center py-6" style={{ color: 'var(--text-disabled)' }}>
        {error}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        aria-label="챔피언 검색"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="챔피언 검색..."
        style={{
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          color: 'var(--text-primary)',
          padding: '8px 12px',
          fontSize: 13,
          width: '100%',
        }}
      />
      {filtered.length === 0 && (
        <div className="text-sm text-center py-6" style={{ color: 'var(--text-disabled)' }}>
          검색 결과가 없습니다.
        </div>
      )}
      {filtered.map(c => {
        const statuses = Object.values(c.weeklyStatus) as MilestoneStatus[]
        const counts = statuses.reduce<Partial<Record<MilestoneStatus, number>>>((acc, s) => {
          acc[s] = (acc[s] ?? 0) + 1
          return acc
        }, {})
        const hasDelay = !!counts.delayed

        return (
          <button
            key={c.userId}
            onClick={() => router.push(`/champions/${c.userId}`)}
            className="flex items-center gap-3 p-3 rounded-xl text-left w-full"
            style={{
              background: 'var(--surface-primary)',
              border: `1px solid ${hasDelay ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}`,
            }}
          >
            <div
              className="flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold"
              style={{
                width: 34, height: 34,
                background: hasDelay ? 'rgba(239,68,68,0.1)' : 'var(--surface-secondary)',
                color: hasDelay ? '#ef4444' : 'var(--text-secondary)',
              }}
            >
              {c.name?.[0] ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>{c.department}</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(['delayed', 'in_progress', 'completed', 'not_started'] as MilestoneStatus[])
                  .filter(s => counts[s])
                  .map(s => (
                    <span
                      key={s}
                      className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: `${STATUS_COLOR[s]}1a`,
                        color: STATUS_COLOR[s],
                      }}
                    >
                      ● {STATUS_LABEL[s]} {counts[s]}
                    </span>
                  ))}
                {statuses.length === 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>마일스톤 없음</span>
                )}
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--border-subtle)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        )
      })}
    </div>
  )
}
