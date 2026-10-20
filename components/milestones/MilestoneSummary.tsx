import type { ViewFilter, ViewSummary } from '@/lib/milestone-view'

export interface MilestoneSummaryProps {
  summary: ViewSummary
  todayStr: string
  filter: ViewFilter
  onFilterChange: (f: ViewFilter) => void
  compact?: boolean // 모바일: 범례·오른쪽 패널 생략
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function weekdayOf(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

export function MilestoneSummary({
  summary,
  todayStr,
  filter,
  onFilterChange,
  compact = false,
}: MilestoneSummaryProps) {
  const { total, done, prog, over, not, pending, thisWeek } = summary
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const w = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%`

  const chips: { key: ViewFilter; label: string }[] = [
    { key: 'all', label: `전체 ${total}` },
    { key: 'prog', label: `진행중 ${prog}` },
    { key: 'over', label: `지연 ${over}` },
    { key: 'todo', label: `예정 ${not}` },
    { key: 'done', label: `완료 ${done}` },
  ]

  const legend = [
    { color: 'var(--success)', label: `완료 ${done}` },
    { color: 'var(--accent)', label: `진행중 ${prog}` },
    { color: 'var(--error)', label: `지연 ${over}` },
    { color: 'var(--accent-disabled)', label: `미시작 ${not}` },
  ]

  return (
    <div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'minmax(0,1fr) 220px',
          gap: 16,
          padding: '16px 18px',
          background: 'var(--surface-minimal)',
          borderRadius: 12,
        }}
      >
        <div className="flex flex-col" style={{ gap: 10, minWidth: 0 }}>
          <div className="flex items-baseline" style={{ gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{done}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>/ {total} 완료</span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{pct}%</span>
            {compact && (
              <span
                className="ml-auto"
                style={{ fontSize: 12, color: 'var(--text-secondary)' }}
              >
                이번 주 마감 {thisWeek} · 지연 {over}
              </span>
            )}
          </div>
          <div
            role="img"
            aria-label={`전체 진행률 ${pct}%`}
            className="flex overflow-hidden"
            style={{ height: 8, borderRadius: 4, background: 'var(--accent-disabled)' }}
          >
            <div style={{ width: w(done), background: 'var(--success)' }} />
            <div style={{ width: w(prog), background: 'var(--accent)' }} />
            <div style={{ width: w(over), background: 'var(--error)' }} />
          </div>
          {!compact && (
            <div
              className="flex flex-wrap"
              style={{ gap: 14, fontSize: 12, color: 'var(--text-secondary)' }}
            >
              {legend.map((l) => (
                <span key={l.label} className="inline-flex items-center" style={{ gap: 5 }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: 2, background: l.color }}
                  />
                  {l.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {!compact && (
          <div
            className="flex flex-col"
            style={{
              borderLeft: '1px solid var(--border)',
              paddingLeft: 16,
              gap: 4,
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            <div>
              이번 주 마감 <strong>{thisWeek}건</strong>
            </div>
            <div>
              지연 <strong style={{ color: 'var(--error)' }}>{over}건</strong> · 이슈 검토중{' '}
              <strong>{pending}건</strong>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              오늘 {todayStr} ({weekdayOf(todayStr)})
            </div>
          </div>
        )}
      </div>
      <div
        className="flex"
        style={{
          gap: 6,
          marginTop: 10,
          flexWrap: compact ? 'nowrap' : 'wrap',
          overflowX: compact ? 'auto' : undefined,
        }}
      >
        {chips.map((c) => {
          const pressed = filter === c.key
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onFilterChange(c.key)}
              style={{
                height: 28,
                padding: '0 11px',
                borderRadius: 999,
                border: `1px solid ${pressed ? 'var(--text-primary)' : 'var(--border)'}`,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: pressed ? 'var(--text-primary)' : 'transparent',
                color: pressed ? 'var(--text-inverse)' : 'var(--text-secondary)',
              }}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
