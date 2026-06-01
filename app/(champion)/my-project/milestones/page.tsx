'use client'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone, CharterSubmission } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { CheckinTab } from '@/components/CheckinTab'
import type { BottleneckType } from '@/lib/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

const inputStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px' }

export default function WorkStatusPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [charterApproved, setCharterApproved] = useState(false)
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [collapsedCheckinGroups, setCollapsedCheckinGroups] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<Milestone[]>('/api/milestones').then(setMilestones),
      apiFetch<CharterSubmission[]>('/api/charter/submissions')
        .then(subs => setCharterApproved(subs.some(s => !!s.admin_approved_at))),
    ])
      .catch((e: Error) => toast.error('로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleCheckinComplete(id: string) {
    try {
      const { milestone: updated, parentUpdated } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_manual_completed: true, bottleneck_type: null, bottleneck_note: null }),
      })
      setMilestones(prev => {
        const next = prev.map(m => m.id === id ? updated : m)
        return parentUpdated ? next.map(m => m.id === parentUpdated.id ? parentUpdated : m) : next
      })
      toast.success('완료로 표시되었습니다.')
    } catch (e: unknown) {
      toast.error('완료 처리에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleCheckinIssueReport(id: string, type: BottleneckType, note: string | null) {
    try {
      const { milestone: updated } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ bottleneck_type: type, bottleneck_note: note, is_manual_completed: false, is_manual_progress: false }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
      toast.success('이슈가 보고되었습니다. 관리자에게 알림이 전송되었습니다.')
    } catch (e: unknown) {
      toast.error('이슈 보고에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleCheckinInProgress(id: string) {
    try {
      const { milestone: updated } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>(`/api/milestones/${id}`, {
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
    setDeadlineModal({ id: m.id, due_date: m.due_date ?? '' })
    setReqForm({ requested_due_date: '', reason: '' })
  }

  async function handleDeadlineRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!deadlineModal) return
    setError(null)
    try {
      const { milestone: updated, parentUpdated } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>(`/api/milestones/${deadlineModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ due_date: reqForm.requested_due_date }),
      })
      setMilestones(prev => {
        const next = prev.map(m => m.id === updated.id ? updated : m)
        return parentUpdated ? next.map(m => m.id === parentUpdated.id ? parentUpdated : m) : next
      })
      setDeadlineModal(null)
      setReqForm({ requested_due_date: '', reason: '' })
      toast.success('기한이 변경되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError('기한 변경에 실패했습니다.')
      toast.error('기한 변경 실패: ' + msg)
    }
  }

  const checkinGroups = useMemo(() => {
    const depth0 = milestones.filter(m => !m.parent_milestone_id)
    const byParent = new Map<string, Milestone[]>()
    for (const g of depth0) byParent.set(g.id, [])
    for (const m of milestones) {
      if (m.parent_milestone_id && byParent.has(m.parent_milestone_id)) {
        byParent.get(m.parent_milestone_id)!.push(m)
      }
    }
    return { depth0, byParent }
  }, [milestones])

  const checkinProps = {
    charterApproved,
    onComplete: handleCheckinComplete,
    onIssueReport: handleCheckinIssueReport,
    onInProgress: handleCheckinInProgress,
    onDeadlineExtension: openDeadlineForCheckin,
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 100px)', minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto pb-8">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
            ))}
          </div>
        ) : (
          <>
            {/* Ungrouped (depth-0) milestones */}
            {milestones.some(m => !m.parent_milestone_id) && (
              <CheckinTab
                milestones={milestones.filter(m => !m.parent_milestone_id)}
                {...checkinProps}
              />
            )}
            {/* Grouped (depth-1) milestones under each depth-0 parent */}
            {checkinGroups.depth0.map(g => {
              const gMilestones = checkinGroups.byParent.get(g.id) ?? []
              if (gMilestones.length === 0) return null
              const isCollapsed = collapsedCheckinGroups.has(g.id)
              return (
                <div key={g.id} style={{ marginTop: 16 }}>
                  <button
                    onClick={() => setCollapsedCheckinGroups(prev => {
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
                    <CheckinTab milestones={gMilestones} {...checkinProps} />
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 기한 변경 dialog */}
      <Dialog
        open={!!deadlineModal}
        onOpenChange={open => { if (!open) { setDeadlineModal(null); setReqForm({ requested_due_date: '', reason: '' }) } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기한 변경</DialogTitle>
            {deadlineModal && (
              <DialogDescription>현재 마감일: {deadlineModal.due_date}</DialogDescription>
            )}
          </DialogHeader>
          {deadlineModal && (
            <form onSubmit={handleDeadlineRequest} className="flex flex-col gap-3">
              {error && (
                <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>
              )}
              <DatePicker
                value={reqForm.requested_due_date}
                onChange={v => setReqForm(r => ({ ...r, requested_due_date: v }))}
                required
                placeholder="새 마감일 선택"
                style={{ ...inputStyle, width: '100%' }}
              />
              <textarea
                value={reqForm.reason}
                onChange={e => setReqForm(r => ({ ...r, reason: e.target.value }))}
                placeholder="변경 사유를 입력해주세요"
                rows={3}
                required
                style={{ ...inputStyle, resize: 'none', width: '100%' }}
              />
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => { setDeadlineModal(null); setReqForm({ requested_due_date: '', reason: '' }) }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--blue-600)', color: '#fff' }}
                >
                  기한 변경
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
