'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api-client'
import type { Milestone, DeadlineChangeRequest } from '@/lib/types'
import DatePicker from '@/components/DatePicker'

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

interface NewMilestone { week_number: string; title: string; start_date: string; due_date: string }

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<MilestoneWithHomework[]>([])
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewMilestone>({ week_number: '1', title: '', start_date: '', due_date: '' })
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string; existingReqId?: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmResubmitId, setConfirmResubmitId] = useState<string | null>(null)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resubmitInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  useEffect(() => {
    apiFetch<MilestoneWithHomework[]>('/api/milestones').then(setMilestones)
    apiFetch<DeadlineChangeRequest[]>('/api/deadline-requests').then(setRequests)
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

  function showSuccess(msg: string) {
    setSuccess(msg)
    if (successTimer.current) clearTimeout(successTimer.current)
    successTimer.current = setTimeout(() => setSuccess(null), 4000)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const created = await apiFetch<MilestoneWithHomework>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({ ...form, week_number: parseInt(form.week_number) }),
      })
      setMilestones(prev => [...prev, created])
      setShowForm(false)
      setForm({ week_number: '1', title: '', start_date: '', due_date: '' })
    } catch {
      setError('마일스톤 추가에 실패했습니다.')
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
    } catch {
      setError('파일 업로드에 실패했습니다.')
    }
  }

  async function handleDownload(milestoneId: string) {
    try {
      const { url } = await apiFetch<{ url: string; file_name: string }>(`/api/milestones/${milestoneId}/deliverables/download`)
      window.open(url, '_blank')
    } catch {
      setError('다운로드 링크를 가져올 수 없습니다.')
    }
  }

  async function handleMarkProgress(id: string) {
    setError(null)
    try {
      const updated = await apiFetch<MilestoneWithHomework>(`/api/milestones/${id}`, {
        method: 'PATCH', body: JSON.stringify({ is_manual_progress: true }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
    } catch {
      setError('상태 변경에 실패했습니다.')
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
      showSuccess(existingReqId ? '기한 변경 요청이 수정되었습니다.' : '기한 변경 요청이 제출되었습니다. 관리자 검토 후 반영됩니다.')
    } catch {
      setError('기한 변경 요청에 실패했습니다.')
    }
  }

  const inputStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px' }

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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>시작일</label>
              <DatePicker value={form.start_date} onChange={v => setForm(f => ({ ...f, start_date: v }))} required placeholder="날짜 선택" style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마감일</label>
              <DatePicker value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} required placeholder="날짜 선택" style={inputStyle} />
            </div>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-xs font-semibold self-start" style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
        </form>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
          ✓ {success}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
          {error}
        </div>
      )}

      {milestones.length === 0 ? (
        <p className="p-6 text-center text-sm" style={{ color: 'var(--text-disabled)' }}>
          아직 마일스톤이 없습니다. 추가해보세요.
        </p>
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
                  <table className="w-full text-xs border-collapse">
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
                              <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}>{m.week_number}주차</span>
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
      {confirmResubmitId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm p-6 rounded-2xl" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm mb-5" style={{ color: 'var(--text-primary)' }}>
              과제 파일을 다시 제출하면 다시 승인을 받아야 합니다. 그래도 재제출 하시겠어요?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmResubmitId(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
              >
                아니요
              </button>
              <button
                onClick={() => {
                  resubmitInputRefs.current.get(confirmResubmitId)?.click()
                  setConfirmResubmitId(null)
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--blue-600)', color: '#fff' }}
              >
                네
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deadline request modal */}
      {deadlineModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <form onSubmit={handleDeadlineRequest} className="w-full max-w-sm p-6 rounded-2xl" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{deadlineModal?.existingReqId ? '기한 변경 요청 수정' : '기한 변경 요청'}</h3>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>현재 마감일: {deadlineModal.due_date}</p>
                <DatePicker value={reqForm.requested_due_date} onChange={v => setReqForm(r => ({ ...r, requested_due_date: v }))} required placeholder="새 마감일 선택" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <textarea value={reqForm.reason} onChange={e => setReqForm(r => ({ ...r, reason: e.target.value }))} placeholder="변경 사유" rows={3} required style={{ ...inputStyle, resize: 'none', width: '100%' }} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>요청 보내기</button>
              <button type="button" onClick={() => setDeadlineModal(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
