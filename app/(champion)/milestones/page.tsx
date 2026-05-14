'use client'
import { useEffect, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--amber)',
  completed: 'var(--success)', delayed: 'var(--error)',
}

interface NewMilestone { week_number: string; title: string; start_date: string; due_date: string }

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewMilestone>({ week_number: '1', title: '', start_date: '', due_date: '' })
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })

  useEffect(() => {
    apiFetch<Milestone[]>('/api/milestones').then(setMilestones)
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const created = await apiFetch<Milestone>('/api/milestones', {
      method: 'POST',
      body: JSON.stringify({ ...form, week_number: parseInt(form.week_number) }),
    })
    setMilestones(prev => [...prev, created])
    setShowForm(false)
    setForm({ week_number: '1', title: '', start_date: '', due_date: '' })
  }

  async function handleUpload(id: string, file: File) {
    const body = new FormData()
    body.append('file', file)
    await apiUpload(`/api/milestones/${id}/deliverables`, body)
    const updated = await apiFetch<Milestone[]>('/api/milestones')
    setMilestones(updated)
  }

  async function handleMarkProgress(id: string) {
    const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
      method: 'PATCH', body: JSON.stringify({ is_manual_progress: true }),
    })
    setMilestones(prev => prev.map(m => m.id === id ? updated : m))
  }

  async function handleDeadlineRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!deadlineModal) return
    await apiFetch('/api/deadline-requests', {
      method: 'POST',
      body: JSON.stringify({ milestone_id: deadlineModal.id, ...reqForm }),
    })
    setDeadlineModal(null)
    setReqForm({ requested_due_date: '', reason: '' })
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
            <input type="number" placeholder="주차" value={form.week_number} onChange={e => setForm(f => ({ ...f, week_number: e.target.value }))} min="1" required style={inputStyle} />
            <input type="text" placeholder="마일스톤 이름" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required style={inputStyle} />
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required style={inputStyle} />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-xs font-semibold self-start" style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
        </form>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              {['주차', '마일스톤', '기간', '상태', '액션'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wide" style={{ color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {milestones.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="px-3 py-3">
                  <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(37,99,235,0.15)', color: '#7dd3fc' }}>{m.week_number}주차</span>
                </td>
                <td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</td>
                <td className="px-3 py-3" style={{ color: 'var(--text-secondary)' }}>{m.start_date} – {m.due_date}</td>
                <td className="px-3 py-3">
                  <span style={{ color: STATUS_COLOR[m.status] }}>
                    {STATUS_LABEL[m.status]}{m.status === 'delayed' ? ' ⚠️' : ''}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2 flex-wrap">
                    {m.status !== 'completed' && (
                      <label className="cursor-pointer px-2 py-1 rounded font-semibold" style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                        📤 업로드
                        <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(m.id, e.target.files[0]) }} />
                      </label>
                    )}
                    {m.status === 'not_started' || m.status === 'delayed' ? (
                      <button onClick={() => handleMarkProgress(m.id)} className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>
                        ▶ 진행 중
                      </button>
                    ) : null}
                    {(m.status === 'delayed' || m.status === 'in_progress') && (
                      <button onClick={() => setDeadlineModal({ id: m.id, due_date: m.due_date })} className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid #fb923c' }}>
                        📅 기한 변경
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {milestones.length === 0 && (
          <p className="p-6 text-center text-sm" style={{ color: 'var(--text-disabled)' }}>아직 마일스톤이 없습니다. 추가해보세요.</p>
        )}
      </div>

      {/* Deadline request modal */}
      {deadlineModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <form onSubmit={handleDeadlineRequest} className="w-full max-w-sm p-6 rounded-2xl" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>기한 변경 요청</h3>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>현재 마감일: {deadlineModal.due_date}</p>
                <input type="date" value={reqForm.requested_due_date} onChange={e => setReqForm(r => ({ ...r, requested_due_date: e.target.value }))} required style={{ ...inputStyle, width: '100%' }} />
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
