'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api-client'
import type { Milestone, DeadlineChangeRequest, BottleneckType } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import DateRangePicker from '@/components/DateRangePicker'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ListTodo } from 'lucide-react'
import { DraftBadge } from '@/components/DraftBadge'
import { PublishStatusFilter, type PublishFilterValue } from '@/components/PublishStatusFilter'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'
import { ResizeHandle, useResizableWidth } from '@/components/ui/resize-handle'

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const REQ_LABEL: Record<string, string> = { pending: '검토 중', approved: '승인됨', rejected: '반려됨' }
const REQ_COLOR: Record<string, string> = {
  pending: 'var(--amber)', approved: 'var(--success)', rejected: 'var(--error)',
}

interface NewMilestone { week_number: string; title: string; start_date: string; due_date: string; description: string }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
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
  onCompleteClick: (id: string) => void
  onDelayClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone) => void
  onInProgress: (id: string) => void
  onGoToWBS: (m: Milestone) => void
}

function MilestoneCard({ m, showActions, hasPendingDeadlineRequest, onCompleteClick, onDelayClick, onDeadlineExtension, onInProgress, onGoToWBS }: MilestoneCardProps) {
  const statusColor = STATUS_COLOR[m.status] ?? 'var(--text-disabled)'
  const statusLabel = STATUS_LABEL[m.status] ?? m.status

  const isDelayPending = m.bottleneck_type !== null && m.bottleneck_reviewed_at === null
  const hasAdminReply = m.bottleneck_reviewed_at !== null && !!m.bottleneck_admin_comment

  // Status-based button visibility
  const showComplete = m.status === 'in_progress' || m.status === 'delayed'
  const showDelay = m.status === 'in_progress' || m.status === 'delayed'
  const showDeadline = m.status === 'not_started' || m.status === 'in_progress' || m.status === 'delayed'
  const showProgress = m.status === 'not_started'

  const pendingPill = (
    <span
      className="text-xs px-3 py-1.5 rounded-full font-semibold"
      style={{
        background: 'rgba(251,191,36,0.12)',
        color: 'var(--amber)',
        cursor: 'default',
        border: '1px solid rgba(251,191,36,0.4)',
      }}
    >
      관리자 검토중
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
            isDelayPending ? pendingPill : (
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
            hasPendingDeadlineRequest ? pendingPill : (
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
            <button
              onClick={() => onInProgress(m.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
            >
              ▶ 진행 중
            </button>
          )}
          <button
            onClick={() => onGoToWBS(m)}
            className="text-xs ml-auto"
            style={{ color: 'var(--text-disabled)' }}
          >
            자세히 보기 →
          </button>
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>완료됨</span>
      )}
    </div>
  )
}

interface CheckinTabProps {
  milestones: Milestone[]
  requests: DeadlineChangeRequest[]
  onComplete: (id: string) => Promise<void>
  onDelayReport: (id: string, type: BottleneckType, note: string | null) => Promise<void>
  onInProgress: (id: string) => Promise<void>
  onDeadlineExtension: (m: Milestone) => void
  onGoToWBS: (m: Milestone) => void
}

function CheckinTab({ milestones, requests, onComplete, onDelayReport, onInProgress, onDeadlineExtension, onGoToWBS }: CheckinTabProps) {
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
                    hasPendingDeadlineRequest={pendingDeadlineIds.has(m.id)}
                    onCompleteClick={id => setCompleteConfirmId(id)}
                    onDelayClick={m => { setDelayMilestone(m); setDelayForm({ type: '', note: '' }) }}
                    onDeadlineExtension={onDeadlineExtension}
                    onInProgress={onInProgress}
                    onGoToWBS={onGoToWBS}
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
                    hasPendingDeadlineRequest={pendingDeadlineIds.has(m.id)}
                    onCompleteClick={id => setCompleteConfirmId(id)}
                    onDelayClick={m => { setDelayMilestone(m); setDelayForm({ type: '', note: '' }) }}
                    onDeadlineExtension={onDeadlineExtension}
                    onInProgress={onInProgress}
                    onGoToWBS={onGoToWBS}
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
                    hasPendingDeadlineRequest={false}
                    onCompleteClick={() => {}}
                    onDelayClick={() => {}}
                    onDeadlineExtension={() => {}}
                    onInProgress={() => {}}
                    onGoToWBS={() => {}}
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

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewMilestone>({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string; existingReqId?: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [confirmResubmitId, setConfirmResubmitId] = useState<string | null>(null)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null)
  const [editForm, setEditForm] = useState({ week_number: '1', title: '', start_date: '', due_date: '' })
  const [editSaving, setEditSaving] = useState(false)
  const resubmitInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { width: listWidth, setWidth: setListWidth, onMouseDown: onResizeList } = useResizableWidth({
    initialWidth: 320,
    min: 240,
    max: 1200,
    side: 'right',
  })

  const [activeTab, setActiveTab] = useState<'wbs' | 'checkin'>('wbs')

  function openForm() {
    if (!showForm && containerRef.current) {
      setListWidth(Math.round(containerRef.current.getBoundingClientRect().width * 0.5))
    }
    setShowForm(true)
  }
  function closeForm() {
    setShowForm(false)
  }

  const [filter, setFilter] = useState<PublishFilterValue>(() => {
    if (typeof window === 'undefined') return 'all'
    const q = new URLSearchParams(window.location.search).get('status') as PublishFilterValue | null
    return q && ['all','published','draft'].includes(q) ? q : 'all'
  })
  useEffect(() => {
    const url = new URL(window.location.href)
    if (filter === 'all') url.searchParams.delete('status')
    else url.searchParams.set('status', filter)
    window.history.replaceState({}, '', url.toString())
  }, [filter])

  const visibleMilestones = useMemo(
    () => filter === 'all' ? milestones : milestones.filter(m => m.publish_status === filter),
    [milestones, filter]
  )

  useEffect(() => {
    apiFetch<Milestone[]>('/api/milestones').then(setMilestones).catch((e: Error) => toast.error('마일스톤 목록 로드 실패: ' + e.message))
    apiFetch<DeadlineChangeRequest[]>('/api/deadline-requests').then(setRequests).catch((e: Error) => toast.error('기한 변경 요청 로드 실패: ' + e.message))
  }, [])

  async function submitNew(publishStatus: 'draft' | 'published') {
    setError(null)
    try {
      const created = await apiFetch<Milestone>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          week_number: parseInt(form.week_number) || null,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          publish_status: publishStatus,
        }),
      })
      setMilestones(prev => [...prev, created])
      setShowForm(false)
      setForm({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
      toast.success(publishStatus === 'draft' ? '임시저장되었습니다.' : '마일스톤이 추가되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        const parsed = JSON.parse(msg)
        if (parsed.error === 'validation_failed') {
          setError('필수 항목을 확인해주세요: ' + parsed.fields.map((f: { field: string }) => f.field).join(', '))
          return
        }
      } catch { /* not JSON */ }
      setError('마일스톤 저장에 실패했습니다.')
      toast.error('저장 실패: ' + msg)
    }
  }

  async function handleUpload(id: string, file: File) {
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      await apiUpload(`/api/milestones/${id}/deliverables`, body)
      const updated = await apiFetch<Milestone[]>('/api/milestones')
      setMilestones(updated)
      toast.success('파일이 업로드되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('파일 업로드에 실패했습니다.')
      toast.error('파일 업로드 실패: ' + msg)
    }
  }

  async function handleDownload(milestoneId: string) {
    try {
      const { url } = await apiFetch<{ url: string; file_name: string }>(`/api/milestones/${milestoneId}/deliverables/download`)
      window.open(url, '_blank')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('다운로드 링크를 가져올 수 없습니다.')
      toast.error('다운로드 실패: ' + msg)
    }
  }

  async function handleMarkProgress(id: string) {
    setError(null)
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
        method: 'PATCH', body: JSON.stringify({ is_manual_progress: true, bottleneck_type: null, bottleneck_note: null }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
      toast.success('상태가 변경되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('상태 변경에 실패했습니다.')
      toast.error('상태 변경 실패: ' + msg)
    }
  }

  async function handleCheckinComplete(id: string) {
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_manual_completed: true, bottleneck_type: null, bottleneck_note: null }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
      toast.success('완료로 표시되었습니다.')
    } catch (e: unknown) {
      toast.error('완료 처리에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleCheckinDelayReport(id: string, type: BottleneckType, note: string | null) {
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ bottleneck_type: type, bottleneck_note: note, is_manual_completed: false, is_manual_progress: false }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
      toast.success('지연 신고가 완료되었습니다. 관리자에게 알림이 전송되었습니다.')
    } catch (e: unknown) {
      toast.error('지연 신고에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleCheckinInProgress(id: string) {
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_manual_progress: true, bottleneck_type: null, bottleneck_note: null, is_manual_completed: false }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
      toast.success('진행 중으로 표시되었습니다.')
    } catch (e: unknown) {
      toast.error('상태 변경에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  function openDeadlineForCheckin(m: Milestone) {
    const existing = requests.filter(r => r.milestone_id === m.id)[0]
    setDeadlineModal({ id: m.id, due_date: m.due_date, existingReqId: existing?.id })
    setReqForm({ requested_due_date: existing?.requested_due_date ?? '', reason: existing?.reason ?? '' })
  }

  function goToWBSDetail(m: Milestone) {
    setActiveTab('wbs')
    openEdit(m)
  }

  async function handleDeadlineRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!deadlineModal) return
    setError(null)
    try {
      const { existingReqId } = deadlineModal
      const result = existingReqId
        ? await apiFetch<DeadlineChangeRequest>(`/api/deadline-requests/${existingReqId}`, {
            method: 'PATCH', body: JSON.stringify(reqForm),
          })
        : await apiFetch<DeadlineChangeRequest>('/api/deadline-requests', {
            method: 'POST', body: JSON.stringify({ milestone_id: deadlineModal.id, ...reqForm }),
          })
      setRequests(prev =>
        existingReqId
          ? prev.map(r => r.id === existingReqId ? result : r)
          : [result, ...prev]
      )
      setDeadlineModal(null)
      setReqForm({ requested_due_date: '', reason: '' })
      toast.success(existingReqId ? '기한 변경 요청이 수정되었습니다.' : '기한 변경 요청이 제출되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('기한 변경 요청에 실패했습니다.')
      toast.error('기한변경 요청 실패: ' + msg)
    }
  }

  function openEdit(m: Milestone) {
    setEditingMilestone(m)
    setEditForm({ week_number: String(m.week_number), title: m.title, start_date: m.start_date, due_date: m.due_date })
  }

  async function submitEdit(publishStatus: 'draft' | 'published') {
    if (!editingMilestone) return
    setEditSaving(true)
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${editingMilestone.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
          week_number: parseInt(editForm.week_number) || null,
          start_date: editForm.start_date || null,
          due_date: editForm.due_date || null,
          publish_status: publishStatus,
        }),
      })
      setMilestones(prev => prev.map(m => m.id === updated.id ? updated : m))
      setEditingMilestone(null)
      toast.success(publishStatus === 'draft' ? '임시저장되었습니다.' : '마일스톤이 수정되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        const parsed = JSON.parse(msg)
        if (parsed.error === 'validation_failed') {
          setError('필수 항목을 확인해주세요: ' + parsed.fields.map((f: { field: string }) => f.field).join(', '))
          return
        }
      } catch { /* not JSON */ }
      setError('수정에 실패했습니다.')
      toast.error('마일스톤 수정 실패: ' + msg)
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await apiFetch(`/api/milestones/${id}`, { method: 'DELETE' })
      setMilestones(prev => prev.filter(m => m.id !== id))
      setEditingMilestone(null)
      toast.success('마일스톤이 삭제되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('삭제에 실패했습니다.')
      toast.error('마일스톤 삭제 실패: ' + msg)
    }
  }

  const inputStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px' }

  // Fixed column widths shared across all section tables so columns line up
  const COL_WIDTHS = ['72px', '22%', '30%', '20%', '20%']

  return (
    <div ref={containerRef} className="flex" style={{ height: 'calc(100vh - 48px)', minHeight: 0 }}>
      {/* Left: header + filter + list */}
      <div
        className="relative flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: (showForm && activeTab === 'wbs') ? `${listWidth}px` : '100%',
          borderRight: (showForm && activeTab === 'wbs') ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        {showForm && activeTab === 'wbs' && <ResizeHandle side="right" onMouseDown={onResizeList} />}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="flex items-center justify-between mb-4 whitespace-nowrap">
            <div>
              <div className="flex gap-1 mb-1">
                <button
                  onClick={() => setActiveTab('wbs')}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{
                    background: activeTab === 'wbs' ? 'rgba(37,99,235,0.15)' : 'transparent',
                    color: activeTab === 'wbs' ? 'var(--blue-600)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  WBS
                </button>
                <button
                  onClick={() => { setActiveTab('checkin'); if (showForm) closeForm() }}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{
                    background: activeTab === 'checkin' ? 'rgba(37,99,235,0.15)' : 'transparent',
                    color: activeTab === 'checkin' ? 'var(--blue-600)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  주간 체크인
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{milestones.length}개 마일스톤</p>
            </div>
            {activeTab === 'wbs' && (
              <button
                onClick={() => (showForm ? closeForm() : openForm())}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{
                  background: showForm ? 'rgba(37,99,235,0.15)' : 'var(--blue-600)',
                  color: showForm ? 'var(--blue-600)' : '#fff',
                }}
              >
                + 마일스톤 추가
              </button>
            )}
          </div>

          {activeTab === 'wbs' && (
            <div className="mb-4">
              <PublishStatusFilter value={filter} onChange={setFilter} />
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
              {error}
            </div>
          )}

      {activeTab === 'checkin' ? (
        <CheckinTab
          milestones={milestones}
          requests={requests}
          onComplete={handleCheckinComplete}
          onDelayReport={handleCheckinDelayReport}
          onInProgress={handleCheckinInProgress}
          onDeadlineExtension={openDeadlineForCheckin}
          onGoToWBS={goToWBSDetail}
        />
      ) : milestones.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="마일스톤이 없습니다"
          description="아래에서 첫 마일스톤을 추가해보세요."
        />
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
          <table className="w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>{COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)' }}>
                {['주차', '마일스톤', '기간', '상태', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wide" style={{ color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleMilestones.map(m => {
                const milestoneReqs = requests.filter(r => r.milestone_id === m.id)
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}>{m.week_number}주차</span>
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          title="편집"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', fontSize: '12px', padding: '2px 3px', lineHeight: 1 }}
                        >
                          ✏
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-1.5">
                        <span>{m.title || '(제목 없음)'}</span>
                        {m.publish_status === 'draft' && <DraftBadge />}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <span style={{ color: 'var(--text-secondary)' }}>{m.start_date} – {m.due_date}</span>
                        {m.publish_status === 'published' && (m.status === 'delayed' || m.status === 'in_progress') && (
                          <button
                            onClick={() => {
                              const existing = milestoneReqs[0]
                              setDeadlineModal({ id: m.id, due_date: m.due_date, existingReqId: existing?.id })
                              setReqForm({ requested_due_date: existing?.requested_due_date ?? '', reason: existing?.reason ?? '' })
                            }}
                            className="text-xs self-start underline"
                            style={{ color: 'var(--text-disabled)' }}
                          >
                            {milestoneReqs.length > 0 ? '기한 변경 요청 수정' : '기한 변경 요청'}
                          </button>
                        )}
                        {m.publish_status === 'published' && (() => {
                          const pending = milestoneReqs.find(r => r.status === 'pending')
                          const resolved = milestoneReqs.find(r => r.status === 'approved' || r.status === 'rejected')
                          const toShow = [pending, resolved].filter(Boolean) as typeof milestoneReqs
                          if (toShow.length === 0) return null
                          return (
                            <div className="flex flex-col gap-1">
                              {toShow.map(r => (
                                <div key={r.id} className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold" style={{ color: REQ_COLOR[r.status] }}>
                                    {REQ_LABEL[r.status]}
                                  </span>
                                  <span style={{ color: 'var(--text-disabled)' }}>→ {r.requested_due_date}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <span style={{ color: STATUS_COLOR[m.status] }}>
                          {STATUS_LABEL[m.status]}{m.status === 'delayed' ? ' ⚠️' : ''}
                        </span>
                        {m.publish_status === 'published' && (m.status === 'not_started' || m.status === 'delayed') && (
                          <button onClick={() => handleMarkProgress(m.id)} className="px-2 py-1 rounded font-semibold self-start" style={{ color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}>
                            ▶ 과제 시작
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-2 items-start">
                        {m.publish_status === 'published' && (() => {
                          const lastDeliverable = m.deliverables?.slice().sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0]
                          return lastDeliverable ? (
                            <button onClick={() => handleDownload(m.id)} className="text-xs underline text-left" style={{ color: 'var(--blue-600)' }}>
                              ⬇ {lastDeliverable.file_name}
                            </button>
                          ) : null
                        })()}
                        {m.publish_status === 'draft' ? (
                          <span
                            title="임시저장 마일스톤은 산출물을 업로드할 수 없습니다. 먼저 게시해주세요."
                            className="px-2 py-1 rounded font-semibold opacity-50 cursor-not-allowed"
                            style={{ background: 'var(--surface-secondary)', color: 'var(--text-disabled)', border: '1px solid var(--border-subtle)' }}
                          >
                            📤 업로드 (게시 필요)
                          </span>
                        ) : m.status === 'completed' ? (
                          <>
                            <button
                              onClick={() => setConfirmResubmitId(m.id)}
                              className="text-xs underline"
                              style={{ color: 'var(--text-disabled)' }}
                            >
                              과제 재제출
                            </button>
                            <input
                              type="file"
                              className="hidden"
                              ref={el => { if (el) resubmitInputRefs.current.set(m.id, el) }}
                              onChange={e => { if (e.target.files?.[0]) { handleUpload(m.id, e.target.files[0]); e.target.value = '' } }}
                            />
                          </>
                        ) : (
                          <label className="cursor-pointer px-2 py-1 rounded font-semibold" style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                            📤 과제 업로드
                            <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(m.id, e.target.files[0]) }} />
                          </label>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
        </div>
      </div>

      {/* Right: form panel */}
      {showForm && activeTab === 'wbs' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0 whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
            <button
              onClick={closeForm}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-secondary)', background: 'var(--surface-secondary)' }}
            >
              ✕
            </button>
            <span className="text-sm font-bold flex-1" style={{ color: 'var(--text-primary)' }}>마일스톤 추가</span>
            <SaveOrPublishButtons
              status="draft"
              saving={false}
              onSaveDraft={() => submitNew('draft')}
              onPublish={() => submitNew('published')}
              size="sm"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>주차</label>
                  <input type="number" value={form.week_number} onChange={e => setForm(f => ({ ...f, week_number: e.target.value }))} min="1" required style={inputStyle} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
                  <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>작업 기간</label>
                <DateRangePicker
                  startDate={form.start_date}
                  endDate={form.due_date}
                  onChange={(s, e) => setForm(f => ({ ...f, start_date: s, due_date: e }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>설명</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="선택사항" rows={2} style={{ ...inputStyle, resize: 'none', width: '100%' }} />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Re-submission confirmation dialog */}
      <Dialog open={!!confirmResubmitId} onOpenChange={open => { if (!open) setConfirmResubmitId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>과제 재제출</DialogTitle>
            <DialogDescription>
              과제 파일을 다시 제출하면 다시 승인을 받아야 합니다. 그래도 재제출 하시겠어요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmResubmitId(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
            >
              아니요
            </button>
            <button
              onClick={() => {
                if (confirmResubmitId) resubmitInputRefs.current.get(confirmResubmitId)?.click()
                setConfirmResubmitId(null)
              }}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--blue-600)', color: '#fff' }}
            >
              네
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit milestone modal */}
      <Dialog
        open={!!editingMilestone}
        onOpenChange={open => { if (!open) setEditingMilestone(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>마일스톤 편집</DialogTitle>
          </DialogHeader>
          {editingMilestone && (
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>주차</label>
                  <input type="number" value={editForm.week_number} onChange={e => setEditForm(f => ({ ...f, week_number: e.target.value }))} min="1" required style={inputStyle} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
                  <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>작업 기간</label>
                <DateRangePicker
                  startDate={editForm.start_date}
                  endDate={editForm.due_date}
                  onChange={(s, e) => setEditForm(f => ({ ...f, start_date: s, due_date: e }))}
                />
              </div>

              <DialogFooter className="border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button"
                      className="px-3 py-2 rounded-lg text-xs font-semibold mr-auto"
                      style={{ color: 'var(--error)', border: '1px solid var(--error)' }}>
                      삭제
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>마일스톤 삭제</AlertDialogTitle>
                      <AlertDialogDescription>정말 삭제하시겠습니까? 되돌릴 수 없습니다.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(editingMilestone.id)}>삭제</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button type="button" onClick={() => setEditingMilestone(null)}
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                  취소
                </button>
                <SaveOrPublishButtons
                  status={editingMilestone.publish_status}
                  saving={editSaving}
                  onSaveDraft={() => submitEdit('draft')}
                  onPublish={() => submitEdit('published')}
                  size="sm"
                />
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Deadline request modal */}
      <Dialog
        open={!!deadlineModal}
        onOpenChange={open => { if (!open) { setDeadlineModal(null); setReqForm({ requested_due_date: '', reason: '' }) } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deadlineModal?.existingReqId ? '기한 변경 요청 수정' : '기한 변경 요청'}</DialogTitle>
            {deadlineModal && (
              <DialogDescription>현재 마감일: {deadlineModal.due_date}</DialogDescription>
            )}
          </DialogHeader>
          {deadlineModal && (
            <form onSubmit={handleDeadlineRequest} className="flex flex-col gap-3">
              <DatePicker value={reqForm.requested_due_date} onChange={v => setReqForm(r => ({ ...r, requested_due_date: v }))} required placeholder="새 마감일 선택" style={{ ...inputStyle, width: '100%' }} />
              <textarea value={reqForm.reason} onChange={e => setReqForm(r => ({ ...r, reason: e.target.value }))} placeholder="변경 사유" rows={3} required style={{ ...inputStyle, resize: 'none', width: '100%' }} />
              <DialogFooter>
                <button type="button" onClick={() => { setDeadlineModal(null); setReqForm({ requested_due_date: '', reason: '' }) }} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
                <button type="submit" className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>요청 보내기</button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
