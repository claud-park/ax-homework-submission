'use client'
import { useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { Milestone, DeadlineChangeRequest, BottleneckType } from '@/lib/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}

const BOTTLENECK_OPTIONS: { value: BottleneckType; label: string }[] = [
  { value: 'technical', label: '기술적 문제' },
  { value: 'resource', label: '리소스 부족' },
  { value: 'external', label: '외부 의존성' },
  { value: 'other', label: '기타' },
]

const CHECKIN_INPUT_STYLE: React.CSSProperties = {
  background: 'var(--surface-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '13px',
  width: '100%',
}

interface MilestoneCardProps {
  m: Milestone
  showActions: boolean
  hasPendingDeadlineRequest: boolean
  charterApproved: boolean
  onCompleteClick: (id: string) => void
  onDelayClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone) => void
  onInProgress: (id: string) => void
}

function MilestoneCard({ m, showActions, hasPendingDeadlineRequest, charterApproved, onCompleteClick, onDelayClick, onDeadlineExtension, onInProgress }: MilestoneCardProps) {
  const statusColor = STATUS_COLOR[m.status] ?? 'var(--text-disabled)'
  const statusLabel = STATUS_LABEL[m.status] ?? m.status

  const isDelayPending = m.bottleneck_type !== null && m.bottleneck_reviewed_at === null
  const hasAdminReply = m.bottleneck_reviewed_at !== null && !!m.bottleneck_admin_comment

  // Status-based button visibility
  const showComplete = m.status === 'in_progress' || m.status === 'delayed'
  const showDelay = m.status === 'in_progress' || m.status === 'delayed'
  const showDeadline = m.status === 'not_started' || m.status === 'in_progress' || m.status === 'delayed'
  const showProgress = m.status === 'not_started'

  const delayPendingPill = (
    <span
      className="text-xs px-3 py-1.5 rounded-full font-semibold"
      style={{
        background: 'rgba(248,113,113,0.1)',
        color: 'var(--error)',
        cursor: 'default',
        border: '1px solid rgba(248,113,113,0.4)',
      }}
    >
      지연 신고 검토중
    </span>
  )

  const deadlinePendingPill = (
    <span
      className="text-xs px-3 py-1.5 rounded-full font-semibold"
      style={{
        background: 'rgba(251,191,36,0.12)',
        color: 'var(--amber)',
        cursor: 'default',
        border: '1px solid rgba(251,191,36,0.4)',
      }}
    >
      기한 연장 검토중
    </span>
  )

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '14px 16px',
        background: showActions ? 'var(--surface-primary)' : 'var(--surface-secondary)',
        opacity: showActions ? 1 : 0.6,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-bold mr-2" style={{ color: 'var(--blue-600)' }}>W{m.week_number}</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>~{m.due_date}</span>
      </div>
      <div className="mb-3">
        <span className="text-xs font-semibold" style={{ color: statusColor }}>
          {statusLabel}{m.status === 'delayed' ? ' ⚠️' : m.status === 'completed' ? ' ✅' : ''}
        </span>
      </div>

      {/* Admin reply bubble — only when reviewed and comment is non-empty */}
      {hasAdminReply && (
        <div
          style={{
            borderLeft: '3px solid var(--blue-600)',
            borderRadius: '0 6px 6px 0',
            background: 'rgba(37,99,235,0.04)',
            padding: '8px 10px 8px 12px',
            marginBottom: '12px',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded"
              style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)' }}
            >
              관리자
            </span>
            <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
              {timeAgo(m.bottleneck_reviewed_at!)}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {m.bottleneck_admin_comment}
          </p>
        </div>
      )}

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {showComplete && (
            <button
              onClick={() => onCompleteClick(m.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}
            >
              ✅ 완료
            </button>
          )}
          {showDelay && (
            isDelayPending ? delayPendingPill : (
              <button
                onClick={() => onDelayClick(m)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}
              >
                ⚠ 지연 신고
              </button>
            )
          )}
          {showDeadline && (
            hasPendingDeadlineRequest ? deadlinePendingPill : (
              <button
                onClick={() => onDeadlineExtension(m)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--amber)', border: '1px solid var(--amber)' }}
              >
                📅 기한 연장
              </button>
            )
          )}
          {showProgress && (
            charterApproved ? (
              <button
                onClick={() => onInProgress(m.id)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
              >
                ▶ 진행 중
              </button>
            ) : (
              <span
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-disabled)', border: '1px solid var(--border-subtle)', cursor: 'default' }}
              >
                검토 중입니다
              </span>
            )
          )}
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>완료됨</span>
      )}
    </div>
  )
}

export interface CheckinTabProps {
  milestones: Milestone[]
  requests: DeadlineChangeRequest[]
  charterApproved: boolean
  onComplete: (id: string) => Promise<void>
  onDelayReport: (id: string, type: BottleneckType, note: string | null) => Promise<void>
  onInProgress: (id: string) => Promise<void>
  onDeadlineExtension: (m: Milestone) => void
}

export function CheckinTab({ milestones, requests, charterApproved, onComplete, onDelayReport, onInProgress, onDeadlineExtension }: CheckinTabProps) {
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(null)
  const [delayMilestone, setDelayMilestone] = useState<Milestone | null>(null)
  const [delayForm, setDelayForm] = useState<{ type: BottleneckType | ''; note: string }>({ type: '', note: '' })
  const [submitting, setSubmitting] = useState(false)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const published = useMemo(
    () => milestones.filter(m => m.publish_status === 'published' && m.start_date && m.due_date),
    [milestones]
  )

  const thisWeek = useMemo(
    () => published.filter(m =>
      new Date(m.start_date) <= today &&
      today <= new Date(m.due_date) &&
      m.status !== 'completed'
    ),
    [published, today]
  )

  const overdue = useMemo(
    () => published.filter(m =>
      new Date(m.due_date) < today &&
      m.status !== 'completed'
    ),
    [published, today]
  )

  const completedInRange = useMemo(
    () => published.filter(m =>
      m.status === 'completed' &&
      new Date(m.start_date) <= today
    ),
    [published, today]
  )

  const pendingDeadlineIds = useMemo(
    () => new Set(requests.filter(r => r.status === 'pending').map(r => r.milestone_id)),
    [requests]
  )

  async function handleCompleteConfirm() {
    if (!completeConfirmId) return
    setSubmitting(true)
    try {
      await onComplete(completeConfirmId)
      setCompleteConfirmId(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelaySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!delayMilestone || !delayForm.type) return
    setSubmitting(true)
    try {
      await onDelayReport(delayMilestone.id, delayForm.type as BottleneckType, delayForm.note || null)
      setDelayMilestone(null)
      setDelayForm({ type: '', note: '' })
    } finally {
      setSubmitting(false)
    }
  }

  const isEmpty = thisWeek.length === 0 && overdue.length === 0

  return (
    <div className="flex flex-col gap-6 pb-8">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>이번 주 체크인할 마일스톤이 없습니다.</p>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>WBS 탭에서 마일스톤을 추가해보세요.</p>
        </div>
      ) : (
        <>
          {thisWeek.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>이번 주</h2>
              <div className="flex flex-col gap-3">
                {thisWeek.map(m => (
                  <MilestoneCard
                    key={m.id}
                    m={m}
                    showActions
                    charterApproved={charterApproved}
                    hasPendingDeadlineRequest={pendingDeadlineIds.has(m.id)}
                    onCompleteClick={id => setCompleteConfirmId(id)}
                    onDelayClick={m => { setDelayMilestone(m); setDelayForm({ type: '', note: '' }) }}
                    onDeadlineExtension={onDeadlineExtension}
                    onInProgress={onInProgress}
                  />
                ))}
              </div>
            </section>
          )}
          {overdue.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--error)' }}>지연 / 미완료</h2>
              <div className="flex flex-col gap-3">
                {overdue.map(m => (
                  <MilestoneCard
                    key={m.id}
                    m={m}
                    showActions
                    charterApproved={charterApproved}
                    hasPendingDeadlineRequest={pendingDeadlineIds.has(m.id)}
                    onCompleteClick={id => setCompleteConfirmId(id)}
                    onDelayClick={m => { setDelayMilestone(m); setDelayForm({ type: '', note: '' }) }}
                    onDeadlineExtension={onDeadlineExtension}
                    onInProgress={onInProgress}
                  />
                ))}
              </div>
            </section>
          )}
          {completedInRange.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>완료됨</h2>
              <div className="flex flex-col gap-3">
                {completedInRange.map(m => (
                  <MilestoneCard
                    key={m.id}
                    m={m}
                    showActions={false}
                    charterApproved={false}
                    hasPendingDeadlineRequest={false}
                    onCompleteClick={() => {}}
                    onDelayClick={() => {}}
                    onDeadlineExtension={() => {}}
                    onInProgress={() => {}}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* 완료 confirm dialog */}
      <Dialog open={!!completeConfirmId} onOpenChange={open => { if (!open) setCompleteConfirmId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>마일스톤을 완료로 표시하시겠어요?</DialogTitle>
            <DialogDescription>완료 후에도 WBS 탭에서 파일을 첨부할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setCompleteConfirmId(null)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
            >
              취소
            </button>
            <button
              onClick={handleCompleteConfirm}
              disabled={submitting}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--success)', color: '#fff', opacity: submitting ? 0.7 : 1 }}
            >
              완료로 표시
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 지연 신고 modal */}
      <Dialog open={!!delayMilestone} onOpenChange={open => { if (!open) { setDelayMilestone(null); setDelayForm({ type: '', note: '' }) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지연 신고</DialogTitle>
            {delayMilestone && (
              <DialogDescription>W{delayMilestone.week_number} {delayMilestone.title}</DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={handleDelaySubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                지연 유형 <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <select
                value={delayForm.type}
                onChange={e => setDelayForm(f => ({ ...f, type: e.target.value as BottleneckType | '' }))}
                required
                style={{ ...CHECKIN_INPUT_STYLE, cursor: 'pointer' }}
              >
                <option value="">선택해주세요</option>
                {BOTTLENECK_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>설명 (선택)</label>
              <textarea
                value={delayForm.note}
                onChange={e => setDelayForm(f => ({ ...f, note: e.target.value }))}
                placeholder="지연 상황을 자세히 설명해주세요"
                rows={3}
                style={{ ...CHECKIN_INPUT_STYLE, resize: 'none' }}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => { setDelayMilestone(null); setDelayForm({ type: '', note: '' }) }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !delayForm.type}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--error)', color: '#fff', opacity: (submitting || !delayForm.type) ? 0.7 : 1 }}
              >
                신고하기
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
