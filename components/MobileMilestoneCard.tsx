import type { Milestone, MilestoneStatus } from '@/lib/types'

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  in_progress: '#3b82f6',
  delayed: '#ef4444',
  completed: '#22c55e',
  not_started: '#cbd5e1',
}
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  in_progress: '진행 중', delayed: '지연', completed: '완료', not_started: '미시작',
}
const STATUS_BG: Record<MilestoneStatus, string> = {
  in_progress: 'rgba(59,130,246,0.1)',
  delayed: 'rgba(239,68,68,0.1)',
  completed: 'rgba(34,197,94,0.1)',
  not_started: 'rgba(148,163,184,0.08)',
}

export interface MobileMilestoneCardProps {
  milestone: Milestone
  todayStr: string
  charterApproved: boolean
  onComplete: (id: string) => void
  onIssueReport: (id: string) => void
  onDeadlineExtension: (m: Milestone) => void
}

export function MobileMilestoneCard({
  milestone: m,
  todayStr,
  charterApproved,
  onComplete,
  onIssueReport,
  onDeadlineExtension,
}: MobileMilestoneCardProps) {
  const isOverdue = !!m.due_date && m.due_date < todayStr && m.status !== 'completed'
  const hasBottleneck = !!m.bottleneck_type

  const borderColor = m.status === 'delayed' || isOverdue
    ? 'rgba(239,68,68,0.3)'
    : m.status === 'in_progress'
    ? 'rgba(59,130,246,0.2)'
    : 'var(--border-subtle)'

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-primary)', border: `1px solid ${borderColor}` }}
    >
      {/* 상단 컬러 바 */}
      <div style={{ height: 3, background: STATUS_COLOR[m.status] }} />

      <div className="p-3">
        {/* 제목 + 상태 배지 */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {m.title}
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: STATUS_BG[m.status], color: STATUS_COLOR[m.status] }}
          >
            {STATUS_LABEL[m.status]}
          </span>
        </div>

        {/* 마감일 */}
        {m.due_date && (
          <p className="text-xs mb-2" style={{ color: isOverdue ? '#ef4444' : 'var(--text-disabled)' }}>
            마감 {m.due_date}{isOverdue ? ' · 기한 초과' : ''}
            {m.week_number ? ` · W${String(m.week_number).padStart(2, '0')}` : ''}
          </p>
        )}

        {/* 이슈 내역 */}
        {hasBottleneck && m.bottleneck_note && (
          <p
            className="text-xs px-2 py-1.5 rounded-lg mb-2"
            style={{
              background: 'rgba(239,68,68,0.06)',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              borderLeft: '2px solid rgba(239,68,68,0.4)',
            }}
          >
            &quot;{m.bottleneck_note}&quot;
          </p>
        )}

        {/* 액션 버튼 */}
        {m.status !== 'completed' && charterApproved && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => onComplete(m.id)}
              className="flex-1 text-xs font-bold py-2 rounded-lg"
              style={{ border: '1.5px solid #22c55e', color: '#16a34a', background: 'rgba(34,197,94,0.07)' }}
            >
              ✓ 완료
            </button>
            {m.status !== 'delayed' ? (
              <button
                onClick={() => onIssueReport(m.id)}
                className="flex-1 text-xs font-bold py-2 rounded-lg"
                style={{ border: '1.5px solid #ef4444', color: '#dc2626', background: 'rgba(239,68,68,0.07)' }}
              >
                ⚠ 이슈 보고
              </button>
            ) : (
              <button
                onClick={() => onDeadlineExtension(m)}
                className="flex-1 text-xs font-bold py-2 rounded-lg"
                style={{ border: '1.5px solid #3b82f6', color: '#2563eb', background: 'rgba(59,130,246,0.07)' }}
              >
                기한 변경
              </button>
            )}
          </div>
        )}
        {m.status !== 'completed' && !charterApproved && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
            과제정의서 승인 후 액션 가능
          </p>
        )}
      </div>
    </div>
  )
}
