'use client'
import type { Milestone, MilestoneStatus } from '@/lib/types'

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  delayed: '#ef4444',
}
const STATUS_BG: Record<MilestoneStatus, string> = {
  not_started: 'rgba(148,163,184,0.3)',
  in_progress: 'rgba(59,130,246,0.25)',
  completed: 'rgba(34,197,94,0.25)',
  delayed: 'rgba(239,68,68,0.25)',
}
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작',
  in_progress: '진행 중',
  completed: '완료',
  delayed: '지연',
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

function fmt(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** sessionDate 기준 간트 표시 구간 라벨 ("M/D ~ M/D"). 외부 라벨에서 재사용. */
export function ganttWindowLabel(sessionDate: string): string {
  return `${fmt(addDays(sessionDate, -3))} ~ ${fmt(addDays(sessionDate, 3))}`
}

interface Props {
  milestones: Milestone[]
  sessionDate: string
  /** 배경/테두리 없이(투명) 렌더 — Notion 스타일 페이지용 */
  bare?: boolean
  /** 내부 "마일스톤 현황 (범위)" 헤더 숨김 — 외부에 라벨이 따로 있을 때 */
  hideHeader?: boolean
}

export function SessionMiniGantt({ milestones, sessionDate, bare, hideHeader }: Props) {
  const windowStart = addDays(sessionDate, -3)
  const windowEnd = addDays(sessionDate, 3)
  const totalDays = 7

  const active = milestones.filter(m => {
    const start = m.start_date ?? m.due_date
    const end = m.due_date ?? m.start_date
    if (!start || !end) return false
    return start <= windowEnd && end >= windowStart
  })

  if (active.length === 0) return null

  // Date header labels: windowStart + 0..6 days
  const headerDates = Array.from({ length: totalDays }, (_, i) => addDays(windowStart, i))

  // Position of session date within window (0-100%)
  const sessionPct = (daysBetween(windowStart, sessionDate) / (totalDays - 1)) * 100

  return (
    <div
      className={bare ? '' : 'mb-4 rounded-xl border p-3'}
      style={bare ? undefined : { background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
    >
      {!hideHeader && (
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          마일스톤 현황 ({fmt(windowStart)} ~ {fmt(windowEnd)})
        </p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {/* Label column */}
        <div style={{ width: 120, flexShrink: 0 }}>
          {/* Header spacer */}
          <div style={{ height: 20 }} />
          {active.map(m => (
            <div
              key={m.id}
              style={{
                height: 28,
                display: 'flex',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span
                className="text-xs truncate"
                style={{ color: 'var(--text-primary)', maxWidth: 118 }}
                title={m.title}
              >
                {m.title}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline column */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {/* Date header */}
          <div style={{ display: 'flex', height: 20, marginBottom: 0 }}>
            {headerDates.map((d) => (
              <div
                key={d}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 10,
                  color: d === sessionDate ? 'var(--blue-600)' : 'var(--text-disabled)',
                  fontWeight: d === sessionDate ? 700 : 400,
                }}
              >
                {fmt(d)}
              </div>
            ))}
          </div>

          {/* Session date vertical line */}
          <div
            style={{
              position: 'absolute',
              top: 20,
              bottom: 0,
              left: `${sessionPct}%`,
              width: 1,
              background: 'var(--blue-600)',
              opacity: 0.5,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* Milestone bars */}
          {active.map(m => {
            const mStart = m.start_date ?? m.due_date!
            const mEnd = m.due_date ?? m.start_date!

            // Clamp to window
            const clampedStart = mStart < windowStart ? windowStart : mStart
            const clampedEnd = mEnd > windowEnd ? windowEnd : mEnd

            const leftPct = (daysBetween(windowStart, clampedStart) / (totalDays - 1)) * 100
            const rightPct = (daysBetween(windowStart, clampedEnd) / (totalDays - 1)) * 100
            const widthPct = Math.max(rightPct - leftPct, 100 / totalDays)

            return (
              <div
                key={m.id}
                style={{ height: 28, marginBottom: 4, position: 'relative' }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    height: 16,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    background: STATUS_BG[m.status],
                    border: `1.5px solid ${STATUS_COLOR[m.status]}`,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 4,
                    overflow: 'hidden',
                  }}
                  title={`${m.title} — ${STATUS_LABEL[m.status]}`}
                >
                  <span style={{ fontSize: 9, color: STATUS_COLOR[m.status], fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
