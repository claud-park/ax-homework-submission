'use client'
import { useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { MobileMilestoneCard } from '@/components/MobileMilestoneCard'
import { MilestoneRow } from '@/components/milestones/MilestoneRow'
import { MilestoneSummary } from '@/components/milestones/MilestoneSummary'
import { StageStepper } from '@/components/milestones/StageStepper'
import { IssueReportDialog } from '@/components/milestones/IssueReportDialog'
import {
  deriveStage, fmtRange, groupByParent, isIssuePending, matchesFilter, summarize,
  type Stage, type ViewFilter,
} from '@/lib/milestone-view'
import type { BottleneckType, CharterSubmission } from '@/lib/types'
import { ChevronRight } from 'lucide-react'

const inputStyle = { background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px' }

const CHARTER_NOT_APPROVED_MSG = '과제정의서 승인 후 진행할 수 있습니다.'
const EMPTY_FILTER_MSG = '이 필터에 해당하는 마일스톤이 없습니다.'

type PatchResult = { milestone: Milestone, parentUpdated: Milestone | null }

interface Props {
  initialMilestones: Milestone[]
  charterApproved: boolean
  charters: Pick<CharterSubmission, 'id' | 'title' | 'project_name' | 'admin_approved_at'>[]
  currentCharterId: string | null
  todayStr: string
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function stageError(e: unknown, fallback: string) {
  const msg = errorText(e)
  if (msg.includes('charter_not_approved')) toast.error(CHARTER_NOT_APPROVED_MSG)
  else toast.error(fallback + msg)
}

export function MilestonesClient({ initialMilestones, charterApproved: initialCharterApproved, charters, currentCharterId, todayStr }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones)
  const charterApproved = initialCharterApproved
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string; start_date: string; isReschedule: boolean } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_start_date: '', requested_due_date: '', reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ViewFilter>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [issueMilestone, setIssueMilestone] = useState<Milestone | null>(null)
  // busyRef는 같은 틱 안의 연타까지 막고, busy state는 버튼 비활성 표시에 쓴다.
  const busyRef = useRef<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  // 마일스톤별 단계 전환 순번. 되돌리기 토스트는 자기 순번이 최신일 때만 동작한다.
  const transitionSeq = useRef<Map<string, number>>(new Map())
  // 마일스톤별로 아직 떠 있을 수 있는 마지막 단계 전환 토스트 id.
  const stageToast = useRef<Map<string, string | number>>(new Map())

  function applyUpdate(updated: Milestone, parentUpdated: Milestone | null) {
    setMilestones(prev => prev.map(m =>
      m.id === updated.id ? updated
        : parentUpdated && m.id === parentUpdated.id ? parentUpdated
        : m,
    ))
  }

  function setBusyFlag(id: string, on: boolean) {
    if (on) busyRef.current.add(id)
    else busyRef.current.delete(id)
    setBusy(new Set(busyRef.current))
  }

  /** 상태 전환 PATCH. 이미 진행 중이면 null을 돌려주고 아무것도 하지 않는다. */
  async function patchStage(id: string, body: Record<string, unknown>): Promise<Milestone | null> {
    if (busyRef.current.has(id)) return null
    setBusyFlag(id, true)
    try {
      const { milestone: updated, parentUpdated } = await apiFetch<PatchResult>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      applyUpdate(updated, parentUpdated ?? null)
      return updated
    } finally {
      setBusyFlag(id, false)
    }
  }

  /** 단계 전환 성공 직후 호출: 순번을 올리고 이전 되돌리기 토스트를 닫는다. */
  function beginTransition(id: string): number {
    const seq = (transitionSeq.current.get(id) ?? 0) + 1
    transitionSeq.current.set(id, seq)
    const prev = stageToast.current.get(id)
    if (prev !== undefined) {
      toast.dismiss(prev)
      stageToast.current.delete(id)
    }
    return seq
  }

  function showStageToast(id: string, msg: string, action: 'start' | 'complete', prevStage: Stage) {
    const seq = beginTransition(id)
    const tid = toast.success(msg, { duration: 6000, action: undoAction(id, action, prevStage, seq) })
    stageToast.current.set(id, tid)
  }

  function stageOf(id: string): Stage {
    const m = milestones.find(x => x.id === id)
    return m ? deriveStage(m) : 'not_started'
  }

  async function undo(id: string, action: 'start' | 'complete', prevStage: Stage, seq: number) {
    // 이 토스트 이후 같은 마일스톤에 다른 전환이 있었다면 그 변경을 되돌려 버리지 않는다.
    if (transitionSeq.current.get(id) !== seq) {
      toast.info('이미 다른 변경이 있어 되돌릴 수 없습니다.')
      return
    }
    if (busyRef.current.has(id)) {
      toast.info('처리 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }
    // 시작 되돌리기는 진행 표시만 끄고, 완료 되돌리기는 완료 직전 단계(진행중/미시작)로 복원한다.
    // prevStage만으로는 '시작 후'와 '진행중에서 완료 후'를 구분할 수 없어(둘 다 이전 단계가 진행중일 수 있음)
    // 어떤 전환을 되돌리는지 action으로 명시한다.
    const body = action === 'start'
      ? { is_manual_progress: false }
      : { is_manual_completed: false, is_manual_progress: prevStage === 'in_progress' }
    try {
      if (await patchStage(id, body)) {
        beginTransition(id) // 되돌린 토스트가 다시 실행되지 않도록 순번을 올린다.
        toast.success('되돌렸습니다.')
      }
    } catch (e: unknown) {
      stageError(e, '되돌리기에 실패했습니다: ')
    }
  }

  function undoAction(id: string, action: 'start' | 'complete', prevStage: Stage, seq: number) {
    return { label: '되돌리기', onClick: () => { void undo(id, action, prevStage, seq) } }
  }

  async function handleStart(id: string) {
    const prevStage = stageOf(id)
    const target = milestones.find(x => x.id === id)
    // 검토 대기 중인 이슈 보고는 시작으로 조용히 철회하지 않는다.
    const body = target && isIssuePending(target)
      ? { is_manual_progress: true, is_manual_completed: false }
      : { is_manual_progress: true, bottleneck_type: null, bottleneck_note: null, is_manual_completed: false }
    try {
      const updated = await patchStage(id, body)
      if (updated) showStageToast(id, '진행중으로 표시했습니다.', 'start', prevStage)
    } catch (e: unknown) {
      stageError(e, '상태 변경에 실패했습니다: ')
    }
  }

  async function handleComplete(id: string) {
    const prevStage = stageOf(id)
    try {
      const updated = await patchStage(id, { is_manual_completed: true, bottleneck_type: null, bottleneck_note: null })
      if (updated) showStageToast(id, '완료로 표시했습니다.', 'complete', prevStage)
    } catch (e: unknown) {
      stageError(e, '완료 처리에 실패했습니다: ')
    }
  }

  // 이슈 보고·노트·기한 변경은 단계를 바꾸지 않으므로 전환 순번(transitionSeq)을 올리지 않는다.
  async function handleCheckinIssueReport(id: string, type: BottleneckType, note: string | null) {
    try {
      const { milestone: updated } = await apiFetch<PatchResult>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ bottleneck_type: type, bottleneck_note: note, is_manual_completed: false }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
      toast.success('이슈가 보고되었습니다. 관리자에게 알림이 전송되었습니다.')
    } catch (e: unknown) {
      toast.error('이슈 보고에 실패했습니다: ' + errorText(e))
    }
  }

  async function handleNoteUpdate(id: string, note: string | null) {
    try {
      const { milestone: updated } = await apiFetch<PatchResult>(`/api/milestones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      })
      setMilestones(prev => prev.map(m => m.id === id ? updated : m))
    } catch (e: unknown) {
      toast.error('노트 저장에 실패했습니다: ' + errorText(e))
      throw e // 편집기가 초안을 유지하도록 호출부에 실패를 알린다.
    }
  }

  function openDeadlineForCheckin(m: Milestone, isReschedule = false) {
    // 기한이 아예 없으면 start+due 모두 설정하는 reschedule 모드로 진입
    setDeadlineModal({ id: m.id, due_date: m.due_date ?? '', start_date: m.start_date ?? '', isReschedule: isReschedule || !m.due_date })
    setReqForm({ requested_start_date: '', requested_due_date: '', reason: '' })
  }

  async function handleDeadlineRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!deadlineModal) return
    setError(null)
    try {
      const patchBody = deadlineModal.isReschedule
        ? { start_date: reqForm.requested_start_date, due_date: reqForm.requested_due_date }
        : { due_date: reqForm.requested_due_date }
      const { milestone: updated, parentUpdated } = await apiFetch<PatchResult>(`/api/milestones/${deadlineModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      })
      applyUpdate(updated, parentUpdated)
      setDeadlineModal(null)
      setReqForm({ requested_start_date: '', requested_due_date: '', reason: '' })
      toast.success('기한이 변경되었습니다.')
    } catch (e: unknown) {
      const msg = errorText(e)
      setError('기한 변경에 실패했습니다.')
      toast.error('기한 변경 실패: ' + msg)
    }
  }

  function toggleGroup(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const published = useMemo(() => milestones.filter(m => m.publish_status === 'published'), [milestones])
  const grouped = useMemo(() => groupByParent(published), [published])
  // 그룹 헤더(상위 마일스톤)는 행으로 나오지 않으므로 요약·칩 집계에서 뺀다.
  const summary = useMemo(() => summarize(grouped.flatMap(g => g.items), todayStr), [grouped, todayStr])
  const groups = useMemo(() => grouped.map(g => ({
    ...g,
    visible: g.items.filter(m => matchesFilter(m, filter, todayStr)),
    done: g.items.filter(m => deriveStage(m) === 'completed').length,
  })), [grouped, filter, todayStr])

  const rowHandlers = {
    todayStr,
    charterApproved,
    onStart: handleStart,
    onComplete: handleComplete,
    onIssueClick: setIssueMilestone,
    onDeadlineExtension: openDeadlineForCheckin,
    onNoteUpdate: handleNoteUpdate,
  }

  const emptyFilter = (
    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '10px 12px' }}>{EMPTY_FILTER_MSG}</p>
  )

  const emptyAll = (
    <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>체크인할 마일스톤이 없습니다.</p>
      <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>과제정의서 페이지에서 마일스톤을 추가해보세요.</p>
    </div>
  )

  return (
    <>
      {charters.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <select
            value={currentCharterId ?? ''}
            onChange={e => {
              const url = new URL(window.location.href)
              url.searchParams.set('charter_id', e.target.value)
              window.location.href = url.toString()
            }}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 14,
              border: '1.5px solid var(--border-subtle)', background: 'var(--surface-secondary)',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
          >
            {charters.map(c => (
              <option key={c.id} value={c.id}>
                {c.title?.trim() || c.project_name?.trim() || 'Charter'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 모바일: 요약 + 그룹별 카드 */}
      <div data-testid="milestones-mobile" className="md:hidden flex flex-col gap-4">
        {published.length === 0 ? emptyAll : (
          <>
            <MilestoneSummary summary={summary} todayStr={todayStr} filter={filter} onFilterChange={setFilter} compact />
            {groups.map(g => {
              if (!g.parent && g.visible.length === 0) return null
              return (
                <div key={g.parent?.id ?? 'loose'} className="flex flex-col gap-2">
                  {g.parent && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{g.parent.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{g.done}/{g.items.length}</span>
                      </div>
                      <StageStepper
                        stage={deriveStage(g.parent)}
                        size="md"
                        busy={busy.has(g.parent.id)}
                        disabled={!charterApproved}
                        disabledReason="과제정의서 승인 후 진행할 수 있습니다"
                        onStart={() => handleStart(g.parent!.id)}
                        onComplete={() => handleComplete(g.parent!.id)}
                      />
                    </div>
                  )}
                  {g.visible.length === 0 ? emptyFilter : g.visible.map(m => (
                    <MobileMilestoneCard key={m.id} m={m} busy={busy.has(m.id)} {...rowHandlers} />
                  ))}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* 데스크톱: 요약 카드 → 그룹(헤더 + 행) */}
      <div data-testid="milestones-desktop" className="hidden md:flex flex-col" style={{ height: 'calc(100vh - 100px)', minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto pb-8">
          {published.length === 0 ? emptyAll : (
            <div className="flex flex-col gap-5">
              <MilestoneSummary summary={summary} todayStr={todayStr} filter={filter} onFilterChange={setFilter} />
              {groups.map(g => {
                const parent = g.parent
                if (!parent) {
                  if (g.visible.length === 0) return null
                  return (
                    <div key="loose">
                      {g.visible.map(m => <MilestoneRow key={m.id} m={m} busy={busy.has(m.id)} {...rowHandlers} />)}
                    </div>
                  )
                }
                const open = !collapsed.has(parent.id)
                const pct = g.items.length === 0 ? 0 : (g.done / g.items.length) * 100
                return (
                  <div key={parent.id}>
                    <div
                      className="flex items-center gap-3"
                      style={{ padding: '6px 10px 6px 8px', borderBottom: '1px solid var(--border)' }}
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggleGroup(parent.id)}
                        className="flex items-center gap-2 flex-1 min-w-0"
                        style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <ChevronRight
                          size={14}
                          style={{
                            color: 'var(--text-tertiary)', flexShrink: 0,
                            transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                          }}
                        />
                        <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {parent.title}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{fmtRange(parent)}</span>
                        <span
                          className="flex-1"
                          style={{ height: 4, minWidth: 40, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}
                        >
                          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--success)' }} />
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {g.done}/{g.items.length} 완료
                        </span>
                      </button>
                      <StageStepper
                        stage={deriveStage(parent)}
                        size="sm"
                        busy={busy.has(parent.id)}
                        disabled={!charterApproved}
                        disabledReason="과제정의서 승인 후 진행할 수 있습니다"
                        onStart={() => handleStart(parent.id)}
                        onComplete={() => handleComplete(parent.id)}
                      />
                    </div>
                    {open && (g.visible.length === 0 ? emptyFilter
                      : g.visible.map(m => <MilestoneRow key={m.id} m={m} busy={busy.has(m.id)} {...rowHandlers} />))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <IssueReportDialog
        milestone={issueMilestone}
        onClose={() => setIssueMilestone(null)}
        onSubmit={handleCheckinIssueReport}
      />

      {/* 기한 변경 dialog (PC/모바일 공유) */}
      <Dialog
        open={!!deadlineModal}
        onOpenChange={open => { if (!open) { setDeadlineModal(null); setReqForm({ requested_start_date: '', requested_due_date: '', reason: '' }) } }}
      >
        <DialogContent style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
          <DialogHeader>
            <DialogTitle>
              {!deadlineModal?.due_date ? '기한 설정' : deadlineModal.isReschedule ? '기한 변경' : '기한 연장'}
            </DialogTitle>
            {deadlineModal && !deadlineModal.isReschedule && deadlineModal.due_date && (
              <DialogDescription>현재 마감일: {deadlineModal.due_date}</DialogDescription>
            )}
            {deadlineModal?.isReschedule && deadlineModal.due_date && (
              <DialogDescription>시작일: {deadlineModal.start_date} · 마감일: {deadlineModal.due_date}</DialogDescription>
            )}
          </DialogHeader>
          {deadlineModal && (
            <form onSubmit={handleDeadlineRequest} className="flex flex-col gap-3">
              {error && (
                <p className="text-xs" style={{ color: 'var(--error)' }}>{error}</p>
              )}
              {deadlineModal.isReschedule && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>새 시작일</label>
                  <DatePicker
                    value={reqForm.requested_start_date}
                    onChange={v => setReqForm(r => ({ ...r, requested_start_date: v }))}
                    required
                    placeholder="새 시작일 선택"
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {deadlineModal.isReschedule ? '새 마감일' : '새 마감일'}
                </label>
                <DatePicker
                  value={reqForm.requested_due_date}
                  onChange={v => setReqForm(r => ({ ...r, requested_due_date: v }))}
                  required
                  placeholder="새 마감일 선택"
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
              {!deadlineModal.isReschedule && deadlineModal.due_date && (
                <textarea
                  value={reqForm.reason}
                  onChange={e => setReqForm(r => ({ ...r, reason: e.target.value }))}
                  placeholder="변경 사유를 입력해주세요"
                  rows={3}
                  required
                  style={{ ...inputStyle, resize: 'none', width: '100%' }}
                />
              )}
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => { setDeadlineModal(null); setReqForm({ requested_start_date: '', requested_due_date: '', reason: '' }) }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--blue-600)', color: 'var(--text-inverse)' }}
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
