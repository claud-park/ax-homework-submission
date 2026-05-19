'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api-client'
import type { Milestone, DeadlineChangeRequest } from '@/lib/types'
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

type MilestoneWithHomework = Milestone & { homeworks: { id: number; title: string } | null }

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

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<MilestoneWithHomework[]>([])
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewMilestone>({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string; existingReqId?: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [confirmResubmitId, setConfirmResubmitId] = useState<string | null>(null)
  const [editingMilestone, setEditingMilestone] = useState<MilestoneWithHomework | null>(null)
  const [editForm, setEditForm] = useState({ week_number: '1', title: '', start_date: '', due_date: '' })
  const [editSaving, setEditSaving] = useState(false)
  const resubmitInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  useEffect(() => {
    apiFetch<MilestoneWithHomework[]>('/api/milestones').then(setMilestones).catch((e: Error) => toast.error('마일스톤 목록 로드 실패: ' + e.message))
    apiFetch<DeadlineChangeRequest[]>('/api/deadline-requests').then(setRequests).catch((e: Error) => toast.error('기한 변경 요청 로드 실패: ' + e.message))
  }, [])

  // Group by homework, sorted by homework id asc, standalone ('독립 WBS') last
  const groups = useMemo(() => {
    const map = new Map<string, { hwId: number | null; hwTitle: string | null; items: MilestoneWithHomework[] }>()
    for (const m of milestones) {
      const key = m.homework_id !== null ? String(m.homework_id) : '__none__'
      if (!map.has(key)) map.set(key, { hwId: m.homework_id, hwTitle: m.homeworks?.title ?? null, items: [] })
      map.get(key)!.items.push(m)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === '__none__') return 1
        if (b === '__none__') return -1
        return Number(a) - Number(b)
      })
      .map(([key, g]) => ({ key, ...g }))
  }, [milestones])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start_date || !form.due_date) { setError('작업 기간을 선택해주세요.'); return }
    setError(null)
    try {
      const created = await apiFetch<MilestoneWithHomework>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({ ...form, week_number: parseInt(form.week_number) }),
      })
      setMilestones(prev => [...prev, created])
      setShowForm(false)
      setForm({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
      toast.success('마일스톤이 추가되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('마일스톤 추가에 실패했습니다.')
      toast.error('마일스톤 생성 실패: ' + msg)
    }
  }

  async function handleUpload(id: string, file: File) {
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      await apiUpload(`/api/milestones/${id}/deliverables`, body)
      const updated = await apiFetch<MilestoneWithHomework[]>('/api/milestones')
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
      const updated = await apiFetch<MilestoneWithHomework>(`/api/milestones/${id}`, {
        method: 'PATCH', body: JSON.stringify({ is_manual_progress: true }),
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

  function openEdit(m: MilestoneWithHomework) {
    setEditingMilestone(m)
    setEditForm({ week_number: String(m.week_number), title: m.title, start_date: m.start_date, due_date: m.due_date })
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editingMilestone) return
    if (!editForm.start_date || !editForm.due_date) { setError('작업 기간을 선택해주세요.'); return }
    setEditSaving(true)
    try {
      const updated = await apiFetch<MilestoneWithHomework>(`/api/milestones/${editingMilestone.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...editForm, week_number: parseInt(editForm.week_number) }),
      })
      setMilestones(prev => prev.map(m => m.id === updated.id ? { ...updated, homeworks: m.homeworks } : m))
      setEditingMilestone(null)
      toast.success('마일스톤이 수정되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>주차별 WBS</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{milestones.length}개 마일스톤</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>
          + 마일스톤 추가
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-6 p-4 rounded-xl border flex flex-col gap-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
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
          <button type="submit" className="px-4 py-2 rounded-lg text-xs font-semibold self-start" style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
        </form>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
          {error}
        </div>
      )}

      {milestones.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="마일스톤이 없습니다"
          description="아래에서 첫 마일스톤을 추가해보세요."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ key, hwId, hwTitle, items }) => {
            const sectionLabel = hwId !== null
              ? `과제 #${String(hwId).padStart(2, '0')}${hwTitle ? `  ${hwTitle}` : ''}`
              : '독립 WBS'

            return (
              <div key={key}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {sectionLabel}
                  </span>
                  <div className="flex-1" style={{ height: '1px', background: 'var(--border-subtle)' }} />
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-disabled)' }}>{items.length}개</span>
                </div>

                {/* Milestone table */}
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
                      {items.map(m => {
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
                            <td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-1.5">
                                <span style={{ color: 'var(--text-secondary)' }}>{m.start_date} – {m.due_date}</span>
                                {(m.status === 'delayed' || m.status === 'in_progress') && (
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
                                {(() => {
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
                                {(m.status === 'not_started' || m.status === 'delayed') && (
                                  <button onClick={() => handleMarkProgress(m.id)} className="px-2 py-1 rounded font-semibold self-start" style={{ color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}>
                                    ▶ 과제 시작
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-2 items-start">
                                {(() => {
                                  const lastDeliverable = m.deliverables?.slice().sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0]
                                  return lastDeliverable ? (
                                    <button onClick={() => handleDownload(m.id)} className="text-xs underline text-left" style={{ color: 'var(--blue-600)' }}>
                                      ⬇ {lastDeliverable.file_name}
                                    </button>
                                  ) : null
                                })()}
                                {m.status === 'completed' ? (
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
              </div>
            )
          })}
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
            <form onSubmit={handleEditSave} className="flex flex-col gap-3">
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
                <button type="submit" disabled={editSaving} className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>
                  {editSaving ? '저장 중...' : '저장'}
                </button>
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
