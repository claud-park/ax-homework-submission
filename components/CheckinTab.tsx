'use client'
import { useMemo, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { Milestone, BottleneckType } from '@/lib/types'

function fmtMD(s: string): string {
  if (!s) return ''
  const [, m, d] = s.split('-').map(Number)
  return `${m}/${d}`
}

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
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '13px',
  width: '100%',
}

interface MilestoneCardProps {
  m: Milestone
  showActions: boolean
  charterApproved: boolean
  onCompleteClick: (id: string) => void
  onIssueClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  onInProgress: (id: string) => void
  onNoteUpdate: (id: string, note: string | null) => Promise<void>
}

function MilestoneCard({ m, showActions, charterApproved, onCompleteClick, onIssueClick, onDeadlineExtension, onInProgress, onNoteUpdate }: MilestoneCardProps) {
  const statusColor = STATUS_COLOR[m.status] ?? 'var(--text-disabled)'
  const statusLabel = STATUS_LABEL[m.status] ?? m.status

  const [noteEditing, setNoteEditing] = useState(false)
  const [noteValue, setNoteValue] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  const canEditNote = m.status === 'in_progress'

  function openNoteEdit() {
    setNoteValue(m.note ?? '')
    setNoteEditing(true)
  }

  async function handleNoteSave() {
    const trimmed = noteValue.trim()
    const next = trimmed === '' ? null : trimmed
    if (next === (m.note ?? null)) { setNoteEditing(false); return }
    setNoteSaving(true)
    try {
      await onNoteUpdate(m.id, next)
    } finally {
      setNoteSaving(false)
      setNoteEditing(false)
    }
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNoteSave() }
    if (e.key === 'Escape') { setNoteEditing(false) }
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const isReschedule = (m.start_date ?? '') < todayStr && m.status === 'not_started'
  const isDelayed = m.status === 'delayed' ||
    (!!m.due_date && m.due_date < todayStr && m.status !== 'completed') ||
    (!!(m.start_date && m.start_date < todayStr) && m.status === 'not_started')
  const isDelayPending = m.bottleneck_type !== null && m.bottleneck_reviewed_at === null
  const hasAdminReply = m.bottleneck_reviewed_at !== null && !!m.bottleneck_admin_comment

  const showComplete = m.status === 'in_progress' || m.status === 'delayed'
  const showDeadline = m.status === 'not_started' || m.status === 'in_progress' || m.status === 'delayed'
  const showProgress = m.status === 'not_started'

  const dateStr = m.start_date
    ? `${fmtMD(m.start_date)} – ${fmtMD(m.due_date ?? '')}`
    : m.due_date ? `~${fmtMD(m.due_date)}` : ''

  return (
    <div
      style={{
        border: isDelayed ? '1px solid var(--error)' : '1px solid var(--border)',
        borderRadius: '10px',
        padding: '14px 16px',
        background: isDelayed ? 'rgba(239,68,68,0.08)' : 'var(--background)',
        opacity: showActions ? 1 : 0.6,
      }}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isDelayPending && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: 'rgba(248,113,113,0.1)',
                color: 'var(--error)',
                border: '1px solid rgba(248,113,113,0.4)',
              }}
            >
              이슈 검토중
            </span>
          )}
          <span className="text-xs font-semibold" style={{ color: statusColor }}>
            {statusLabel}{m.status === 'completed' ? ' ✅' : ''}
          </span>
        </div>
      </div>

      {/* Date + issue-report row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {isDelayed && <span style={{ color: 'var(--error)', fontSize: 15 }}>⚠️</span>}
        {dateStr && (
          <span
            className="font-semibold"
            style={{ fontSize: 14, color: isDelayed ? 'var(--error)' : 'var(--text-secondary)' }}
          >
            {dateStr}
          </span>
        )}
        {showActions && showDeadline && (
          isReschedule ? (
            <button
              onClick={() => onDeadlineExtension(m, true)}
              className="text-xs"
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              기한 변경
            </button>
          ) : (
            <button
              onClick={() => onDeadlineExtension(m, false)}
              className="text-xs"
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {m.due_date ? '기한 연장' : '기한 설정'}
            </button>
          )
        )}
        {isDelayed && showActions && !isDelayPending && (
          <button
            onClick={() => onIssueClick(m)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}
          >
            ⚠ 이슈 보고/도움 요청
          </button>
        )}
      </div>

      {/* Admin reply bubble */}
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

      {/* 진행 노트 */}
      {noteEditing ? (
        <div className="flex flex-col gap-1.5 mb-3">
          <textarea
            autoFocus
            value={noteValue}
            onChange={e => setNoteValue(e.target.value)}
            onKeyDown={handleNoteKeyDown}
            placeholder="진행 상황을 간단히 메모해주세요"
            rows={2}
            style={{
              background: 'var(--background)',
              border: '1px solid var(--blue-600)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              padding: '7px 10px',
              fontSize: '12px',
              resize: 'none',
              width: '100%',
              outline: 'none',
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleNoteSave}
              disabled={noteSaving}
              className="text-xs px-3 py-1 rounded-md font-semibold"
              style={{ background: 'var(--blue-600)', color: '#fff', opacity: noteSaving ? 0.7 : 1 }}
            >
              저장
            </button>
            <button
              onClick={() => setNoteEditing(false)}
              className="text-xs px-3 py-1 rounded-md"
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              취소
            </button>
          </div>
        </div>
      ) : m.note ? (
        <div
          className="flex items-start gap-2 mb-3"
          style={{ background: 'rgba(37,99,235,0.04)', borderRadius: '6px', padding: '7px 10px' }}
        >
          <p className="text-xs flex-1" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {m.note}
          </p>
          {canEditNote && (
            <button
              onClick={openNoteEdit}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer', flexShrink: 0 }}
              title="노트 편집"
            >
              ✏️
            </button>
          )}
        </div>
      ) : canEditNote ? (
        <div className="mb-3">
          <button
            onClick={openNoteEdit}
            className="text-xs"
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
          >
            + 진행 노트 추가
          </button>
        </div>
      ) : null}

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
          {showProgress && (
            charterApproved ? (
              <button
                onClick={() => onInProgress(m.id)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
              >
                ▶ 진행 시작
              </button>
            ) : (
              <span
                className="text-xs px-3 py-1 rounded-full font-semibold"
                style={{ background: 'transparent', color: 'var(--text-disabled)', border: '1px solid var(--border)', cursor: 'default' }}
              >
                과제 정의서 검토중
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
  charterApproved: boolean
  charterId?: string
  onComplete: (id: string) => Promise<void>
  onIssueReport: (id: string, type: BottleneckType, note: string | null) => Promise<void>
  onInProgress: (id: string) => Promise<void>
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  onNoteUpdate: (id: string, note: string | null) => Promise<void>
  showOverdue?: boolean
}

export function CheckinTab({ milestones, charterApproved, charterId, onComplete, onIssueReport, onInProgress, onDeadlineExtension, onNoteUpdate, showOverdue = true }: CheckinTabProps) {
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(null)
  const [issueMilestone, setIssueMilestone] = useState<Milestone | null>(null)
  const [issueForm, setIssueForm] = useState<{ type: BottleneckType | ''; note: string }>({ type: '', note: '' })
  const [submitting, setSubmitting] = useState(false)

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const published = useMemo(
    () => milestones.filter(m => m.publish_status === 'published'),
    [milestones]
  )

  const thisWeek = useMemo(
    () => published.filter(m =>
      m.status === 'in_progress' &&
      !(m.due_date && m.due_date < todayStr)
    ),
    [published, todayStr]
  )

  const overdue = useMemo(
    () => published.filter(m => {
      if (m.status === 'completed') return false
      if (m.status === 'delayed') return true
      if (m.status === 'in_progress') return !!(m.due_date && m.due_date < todayStr)
      return !!(m.due_date && m.due_date < todayStr) ||
        !!(m.start_date && m.start_date < todayStr && m.status === 'not_started')
    }),
    [published, todayStr]
  )

  const upcoming = useMemo(
    () => published.filter(m =>
      (m.start_date ?? '') >= todayStr &&
      m.status !== 'completed' &&
      m.status !== 'in_progress'
    ),
    [published, todayStr]
  )

  const noDueDate = useMemo(
    () => published.filter(m => !m.due_date && m.status !== 'completed'),
    [published]
  )

  const completedInRange = useMemo(
    () => published.filter(m =>
      m.status === 'completed' &&
      (m.start_date ?? '') <= todayStr
    ),
    [published, todayStr]
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

  async function handleIssueSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!issueMilestone || !issueForm.type || !issueForm.note.trim()) return
    setSubmitting(true)
    try {
      await onIssueReport(issueMilestone.id, issueForm.type as BottleneckType, issueForm.note || null)
      setIssueMilestone(null)
      setIssueForm({ type: '', note: '' })
    } finally {
      setSubmitting(false)
    }
  }

  const cardProps = (m: Milestone, showActions: boolean) => ({
    m,
    showActions,
    charterApproved,
    onCompleteClick: (id: string) => setCompleteConfirmId(id),
    onIssueClick: (m: Milestone) => { setIssueMilestone(m); setIssueForm({ type: '', note: '' }) },
    onDeadlineExtension,
    onInProgress,
    onNoteUpdate,
  })

  const isEmpty = thisWeek.length === 0 && overdue.length === 0 && upcoming.length === 0 && noDueDate.length === 0

  return (
    <div className="flex flex-col gap-6 pb-8">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>체크인할 마일스톤이 없습니다.</p>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>과제정의서 페이지에서 마일스톤을 추가해보세요.</p>
        </div>
      ) : (
        <>
          {showOverdue && overdue.length > 0 && (
            <section>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <span style={{ fontSize: 16 }}>🚨</span>
                <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--error)' }}>
                  지연 / 미완료 <span className="font-normal text-xs" style={{ color: 'rgba(239,68,68,0.7)' }}>({overdue.length}건)</span>
                </h2>
              </div>
              <div className="flex flex-col gap-3">
                {overdue.map(m => <MilestoneCard key={m.id} {...cardProps(m, true)} />)}
              </div>
            </section>
          )}
          {noDueDate.length > 0 && (
            <section>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
                style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid var(--border-subtle)' }}
              >
                <span style={{ fontSize: 15 }}>📅</span>
                <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  기한 미설정 <span className="font-normal text-xs" style={{ color: 'var(--text-disabled)' }}>({noDueDate.length}건)</span>
                </h2>
              </div>
              <div className="flex flex-col gap-3">
                {noDueDate.map(m => <MilestoneCard key={m.id} {...cardProps(m, true)} />)}
              </div>
            </section>
          )}
          {thisWeek.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--blue-600)' }}>진행 중</h2>
              <div className="flex flex-col gap-3">
                {thisWeek.map(m => <MilestoneCard key={m.id} {...cardProps(m, true)} />)}
              </div>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>예정</h2>
              <div className="flex flex-col gap-3">
                {upcoming.map(m => <MilestoneCard key={m.id} {...cardProps(m, true)} />)}
              </div>
            </section>
          )}
          {completedInRange.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--success)' }}>완료됨</h2>
              <div className="flex flex-col gap-3">
                {completedInRange.map(m => <MilestoneCard key={m.id} {...cardProps(m, false)} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* 완료 confirm dialog */}
      <Dialog open={!!completeConfirmId} onOpenChange={open => { if (!open) setCompleteConfirmId(null) }}>
        <DialogContent style={{ background: '#ffffff', borderColor: 'var(--border)' }}>
          <DialogHeader>
            <DialogTitle>마일스톤을 완료로 표시하시겠어요?</DialogTitle>
            <DialogDescription>완료 후에도 수정할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setCompleteConfirmId(null)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
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

      {/* 이슈 보고/도움 요청 modal */}
      <Dialog open={!!issueMilestone} onOpenChange={open => { if (!open) { setIssueMilestone(null); setIssueForm({ type: '', note: '' }) } }}>
        <DialogContent style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
          <DialogHeader>
            <DialogTitle>이슈 보고/도움 요청</DialogTitle>
            {issueMilestone && (
              <DialogDescription>{issueMilestone.title}</DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={handleIssueSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                이슈 유형 <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <select
                value={issueForm.type}
                onChange={e => setIssueForm(f => ({ ...f, type: e.target.value as BottleneckType | '' }))}
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
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>설명 <span style={{ color: 'var(--error)' }}>*</span></label>
              <textarea
                value={issueForm.note}
                onChange={e => setIssueForm(f => ({ ...f, note: e.target.value }))}
                placeholder="이슈 상황을 자세히 설명해주세요"
                rows={3}
                required
                style={{ ...CHECKIN_INPUT_STYLE, resize: 'none' }}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => { setIssueMilestone(null); setIssueForm({ type: '', note: '' }) }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !issueForm.type || !issueForm.note.trim()}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--error)', color: '#fff', opacity: (submitting || !issueForm.type || !issueForm.note.trim()) ? 0.7 : 1 }}
              >
                보고하기
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
