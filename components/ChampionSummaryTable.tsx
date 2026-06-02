'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { ChampionSummary, MilestoneStatus } from '@/lib/types'

const STATUS_ICON: Record<MilestoneStatus, string> = {
  completed: '🟢',
  in_progress: '🟡',
  delayed: '🔴',
  not_started: '⬜',
}

const AMBER_BADGE: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  background: 'rgba(217,119,6,0.1)',
  color: 'var(--amber)',
  display: 'inline-block',
}

interface Props {
  onChampionClick: (userId: string) => void
  onCharterClick: (userId: string) => void
  highlightUserId?: string
}

export function ChampionSummaryTable({ onChampionClick, onCharterClick, highlightUserId }: Props) {
  const [champions, setChampions] = useState<ChampionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<ChampionSummary[]>('/api/champions')
      .then(setChampions)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const allWeeks = Array.from(
    new Set(champions.flatMap(c => Object.keys(c.weeklyStatus).map(Number)))
  ).sort((a, b) => a - b)

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
            {['부서', '이름', '과제명', '과제정의서', ...allWeeks.map(w => `W${w}`)].map(h => (
              <th
                key={h}
                scope="col"
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {champions.map(c => (
            <tr
              key={c.userId}
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                background: c.userId === highlightUserId ? 'rgba(37,99,235,0.06)' : 'transparent',
              }}
            >
              <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {c.department || '—'}
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button
                  onClick={() => onChampionClick(c.userId)}
                  style={{ color: 'var(--blue-600)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  {c.name}
                </button>
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>
                {c.projectName || '—'}
              </td>
              <td style={{ padding: '10px 12px' }}>
                {c.charterSubmissionId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <button
                      onClick={() => onCharterClick(c.userId)}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        background: c.charterStatus === 'published' ? 'rgba(37,99,235,0.1)' : 'rgba(100,116,139,0.1)',
                        color: c.charterStatus === 'published' ? 'var(--blue-600)' : 'var(--text-secondary)',
                        alignSelf: 'flex-start',
                      }}
                    >
                      {c.charterStatus === 'published' ? '📋 게시됨' : '📝 초안'}
                    </button>
                    {Object.keys(c.weeklyStatus).length === 0 && (
                      <span style={{ ...AMBER_BADGE, alignSelf: 'flex-start' }}>
                        마일스톤 없음
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={AMBER_BADGE}>⚠️ 미제출</span>
                )}
              </td>
              {allWeeks.map(w => (
                <td key={w} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 16 }}>
                  {c.weeklyStatus[w]
                    ? STATUS_ICON[c.weeklyStatus[w]]
                    : <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
