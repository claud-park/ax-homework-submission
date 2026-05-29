'use client'
import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone, DeadlineChangeRequest, BottleneckType, CharterSubmission } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { CheckinTab } from '@/components/CheckinTab'
import { ChevronDown, ChevronRight } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '13px',
}

export default function CheckinPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])
  const [charterApproved, setCharterApproved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string; existingReqId?: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })
  const [collapsedSubTasks, setCollapsedSubTasks] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const depth0 = milestones.filter(m => !m.parent_milestone_id)
    const byParent = new Map<string, typeof milestones>()
    for (const g of depth0) byParent.set(g.id, [])
    for (const m of milestones) {
      if (m.parent_milestone_id && byParent.has(m.parent_milestone_id)) {
        byParent.get(m.parent_milestone_id)!.push(m)
      }
    }
    return { depth0, byParent }
  }, [milestones])

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

  async function handleDeadlineRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!deadlineModal) return
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
      toast.error('기한변경 요청 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>주간 체크인</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>이번 주 마일스톤을 확인하세요</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : (
        <>
          {/* 상위 마일스톤 없는 마일스톤 (독립 마일스톤) */}
          {milestones.some(m => !m.parent_milestone_id) && (
            <CheckinTab
              milestones={milestones.filter(m => !m.parent_milestone_id)}
              requests={requests}
              charterApproved={charterApproved}
              onComplete={handleCheckinComplete}
              onDelayReport={handleCheckinDelayReport}
              onInProgress={handleCheckinInProgress}
              onDeadlineExtension={openDeadlineForCheckin}
            />
          )}

          {/* depth-0 그룹별 섹션 */}
          {groups.depth0.map(g => {
            const gMilestones = groups.byParent.get(g.id) ?? []
            if (gMilestones.length === 0) return null
            const isCollapsed = collapsedSubTasks.has(g.id)
            return (
              <div key={g.id} style={{ marginTop: 16 }}>
                <button
                  onClick={() => setCollapsedSubTasks(prev => {
                    const next = new Set(prev)
                    if (next.has(g.id)) next.delete(g.id)
                    else next.add(g.id)
                    return next
                  })}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg mb-2"
                  style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}
                >
                  {isCollapsed
                    ? <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                    : <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />}
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{g.title}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-disabled)' }}>{gMilestones.length}개</span>
                </button>
                {!isCollapsed && (
                  <CheckinTab
                    milestones={gMilestones}
                    requests={requests}
                    charterApproved={charterApproved}
                    onComplete={handleCheckinComplete}
                    onDelayReport={handleCheckinDelayReport}
                    onInProgress={handleCheckinInProgress}
                    onDeadlineExtension={openDeadlineForCheckin}
                  />
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Deadline modal */}
      <Dialog open={!!deadlineModal} onOpenChange={open => { if (!open) { setDeadlineModal(null); setReqForm({ requested_due_date: '', reason: '' }) } }}>
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
