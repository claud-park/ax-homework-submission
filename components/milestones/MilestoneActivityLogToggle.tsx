'use client'
import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { MilestoneActivityLog } from '@/lib/types'

function relativeDate(dateStr: string): string {
  const today = new Date()
  const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (dateStr >= todayLocal) return '오늘'
  const [y, m, d] = dateStr.split('-').map(Number)
  const [ty, tm, td] = todayLocal.split('-').map(Number)
  // Date.UTC with the same y/m/d components on both sides cancels out timezone entirely,
  // giving a pure calendar-day difference (avoids the UTC/KST day-shift the old instant-diff had).
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000)
  if (diffDays <= 0) return '오늘'
  if (diffDays === 1) return '어제'
  return `${diffDays}일 전`
}

interface MilestoneActivityLogToggleProps {
  milestoneId: string
  userId?: string
}

export default function MilestoneActivityLogToggle({ milestoneId, userId }: MilestoneActivityLogToggleProps) {
  const [expanded, setExpanded] = useState(false)
  const [logs, setLogs] = useState<MilestoneActivityLog[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function toggle() {
    if (loading) return
    if (!expanded && logs === null) {
      setLoading(true)
      setError(false)
      try {
        const qs = userId ? `?user_id=${userId}` : ''
        const { logs: data } = await apiFetch<{ logs: MilestoneActivityLog[] }>(`/api/milestones/${milestoneId}/log${qs}`)
        setLogs(data)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(e => !e)
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={toggle}
        className="text-xs"
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
      >
        {expanded ? '작업 로그 접기' : '작업 로그 보기'}
        {logs && logs.length > 0 ? ` (${logs.length})` : ''}
      </button>

      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>불러오는 중...</p>
          ) : error ? (
            <p className="text-xs" style={{ color: 'var(--error)' }}>작업 로그를 불러오지 못했습니다. 다시 시도해주세요.</p>
          ) : logs && logs.length > 0 ? (
            logs.map(l => (
              <div
                key={l.id}
                style={{ background: 'rgba(37,99,235,0.04)', borderRadius: '6px', padding: '6px 9px' }}
              >
                <p className="text-xs font-semibold" style={{ color: 'var(--text-disabled)' }}>
                  {l.log_date} · {relativeDate(l.log_date)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {l.note}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>기록된 작업 로그가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}
