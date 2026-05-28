'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api-client'
import type { Milestone, DeadlineChangeRequest, CharterSubmission } from '@/lib/types'
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

interface NewMilestone { title: string; start_date: string; due_date: string; description: string }

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])
  const [charterApproved, setCharterApproved] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewMilestone>({ title: '', start_date: '', due_date: '', description: '' })
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string; existingReqId?: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [confirmResubmitId, setConfirmResubmitId] = useState<string | null>(null)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null)
  const [editForm, setEditForm] = useState({ title: '', start_date: '', due_date: '' })
  const [editSaving, setEditSaving] = useState(false)
  const resubmitInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { width: listWidth, setWidth: setListWidth, onMouseDown: onResizeList } = useResizableWidth({
    initialWidth: 320,
    min: 240,
    max: 1200,
    side: 'right',
  })

  const [loading, setLoading] = useState(true)

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
    Promise.all([
      apiFetch<Milestone[]>('/api/milestones').then(setMilestones),
      apiFetch<DeadlineChangeRequest[]>('/api/deadline-requests').then(setRequests),
      apiFetch<CharterSubmission[]>('/api/charter/submissions')
        .then(subs => setCharterApproved(subs.some(s => !!s.admin_approved_at))),
    ])
      .catch((e: Error) => toast.error('마일스톤 목록 로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  async function submitNew(publishStatus: 'draft' | 'published') {
    setError(null)
    try {
      const created = await apiFetch<Milestone>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          publish_status: publishStatus,
        }),
      })
      setMilestones(prev => [...prev, created])
      setShowForm(false)
      setForm({ title: '', start_date: '', due_date: '', description: '' })
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
    setEditForm({ title: m.title, start_date: m.start_date, due_date: m.due_date })
  }

  async function submitEdit(publishStatus: 'draft' | 'published') {
    if (!editingMilestone) return
    setEditSaving(true)
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${editingMilestone.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
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
  const COL_WIDTHS = ['30%', '35%', '20%', '15%']

  return (
    <div ref={containerRef} className="flex" style={{ height: 'calc(100vh - 48px)', minHeight: 0 }}>
      {/* Left: header + filter + list */}
      <div
        className="relative flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: showForm ? `${listWidth}px` : '100%',
          borderRight: showForm ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        {showForm && <ResizeHandle side="right" onMouseDown={onResizeList} />}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="flex items-center justify-between mb-4 whitespace-nowrap">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{milestones.length}개 마일스톤</p>
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
          </div>

          <div className="mb-4">
            <PublishStatusFilter value={filter} onChange={setFilter} />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
              {error}
            </div>
          )}

      {loading ? (
        <div className="flex flex-col gap-2 mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-full rounded-lg animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
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
                {['마일스톤', '기간', '상태', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wide" style={{ color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleMilestones.map(m => {
                const milestoneReqs = requests.filter(r => r.milestone_id === m.id)
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-1.5">
                        <span>{m.title || '(제목 없음)'}</span>
                        {m.publish_status === 'draft' && <DraftBadge />}
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
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <span style={{ color: 'var(--text-secondary)' }}>{m.start_date} ~ {m.due_date}</span>
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
                                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: REQ_COLOR[r.status], background: `${REQ_COLOR[r.status]}18`, border: `1px solid ${REQ_COLOR[r.status]}40` }}>
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
                          charterApproved ? (
                            <button onClick={() => handleMarkProgress(m.id)} className="px-2 py-1 rounded font-semibold self-start" style={{ color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}>
                              ▶ 과제 시작
                            </button>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold self-start" style={{ color: 'var(--text-disabled)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                              과제 정의서 검토중
                            </span>
                          )
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
      {showForm && (
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
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
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
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
                <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
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
