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
import { MobileMilestoneCard } from '@/components/MobileMilestoneCard'
import type { BottleneckType } from '@/lib/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

const inputStyle = { background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px' }

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

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const overdueIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of milestones) {
      if (m.publish_status === 'published' && m.start_date && m.due_date &&
          m.status !== 'completed' && m.status !== 'in_progress' &&
          (m.due_date < todayStr || (m.start_date < todayStr && m.status === 'not_started'))) {
        ids.add(m.id)
      }
    }
    return ids
  }, [milestones, todayStr])

  const allOverdue = useMemo(() => milestones.filter(m => overdueIds.has(m.id)), [milestones, overdueIds])

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
    <>
      {/* 모바일: 마일스톤 카드 */}
      <div className="md:hidden flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))
        ) : (
          (() => {
            const byWeek = new Map<number | null, Milestone[]>()
            for (const m of milestones.filter(m => !m.parent_milestone_id)) {
              const key = m.week_number ?? null
              if (!byWeek.has(key)) byWeek.set(key, [])
              byWeek.get(key)!.push(m)
            }
            const sorted = [...byWeek.entries()].sort(([a], [b]) =>
              (a ?? 999) - (b ?? 999)
            )
            return sorted.map(([week, ms]) => (
              <div key={String(week)}>
                {week !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)', letterSpacing: '.04em' }}>
                      W{String(week).padStart(2, '0')}
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {ms.map(m => (
                    <MobileMilestoneCard
                      key={m.id}
                      milestone={m}
                      todayStr={todayStr}
                      charterApproved={charterApproved}
                      onComplete={handleCheckinComplete}
                      onIssueReport={(id) => handleCheckinIssueReport(id, 'other', null)}
                      onDeadlineExtension={openDeadlineForCheckin}
                    />
                  ))}
                </div>
              </div>
            ))
          })()
        )}
      </div>

      {/* 데스크톱: 기존 레이아웃 */}
      <div className="hidden md:flex flex-col" style={{ height: 'calc(100vh - 100px)', minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto pb-8">
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
              ))}
            </div>
          ) : (
            <>
              {allOverdue.length > 0 && (
                <CheckinTab milestones={allOverdue} {...checkinProps} />
              )}
              {milestones.some(m => !m.parent_milestone_id && !overdueIds.has(m.id)) && (
                <CheckinTab
                  milestones={milestones.filter(m => !m.parent_milestone_id && !overdueIds.has(m.id))}
                  showOverdue={false}
                  {...checkinProps}
                />
              )}
              {checkinGroups.depth0.map(g => {
                const gMilestones = (checkinGroups.byParent.get(g.id) ?? []).filter(m => !overdueIds.has(m.id))
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
                      className="flex items-center gap-2 w-full mb-3"
                      style={{ background: 'transparent', border: 'none', padding: 0 }}
                    >
                      {isCollapsed
                        ? <ChevronRight size={13} style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
                        : <ChevronDown size={13} style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />}
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{g.title}</span>
                      <span className="text-xs ml-1" style={{ color: 'var(--text-disabled)', whiteSpace: 'nowrap' }}>{gMilestones.length}개</span>
                      <span className="flex-1 ml-2" style={{ height: 1, background: 'var(--border)' }} />
                    </button>
                    {!isCollapsed && (
                      <CheckinTab milestones={gMilestones} showOverdue={false} {...checkinProps} />
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* 기한 변경 dialog (PC/모바일 공유) */}
      <Dialog
        open={!!deadlineModal}
        onOpenChange={open => { if (!open) { setDeadlineModal(null); setReqForm({ requested_due_date: '', reason: '' }) } }}
      >
        <DialogContent style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
          <DialogHeader>
            <DialogTitle>기한 연장</DialogTitle>
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
                  style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
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
    </>
  )
}
