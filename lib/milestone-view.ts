import type { Milestone } from '@/lib/types'

export type Stage = 'not_started' | 'in_progress' | 'completed'
export type ViewFilter = 'all' | 'prog' | 'over' | 'todo' | 'done'
export type DueBadge = { label: string; tone: 'ok' | 'soon' | 'over' | 'muted' } | null
export interface MilestoneGroup { parent: Milestone | null; items: Milestone[] }
export interface ViewSummary { total: number; done: number; prog: number; over: number; not: number; pending: number; thisWeek: number }

type StageInput = Pick<Milestone, 'status' | 'is_manual_progress' | 'is_manual_completed'>
type ScheduleInput = StageInput & Pick<Milestone, 'start_date' | 'due_date'>

/**
 * 단계 도출. 서버 computeStatus 순서대로 수동 플래그를 먼저 본다 —
 * 서버는 due_date가 있을 때만 status를 다시 계산하므로 기한 없는 마일스톤은 플래그로만 단계가 바뀐다.
 */
export function deriveStage(m: StageInput): Stage {
  if (m.is_manual_completed) return 'completed'
  if (m.is_manual_progress) return 'in_progress'
  if (m.status === 'completed') return 'completed'
  if (m.status === 'in_progress') return 'in_progress'
  return 'not_started'
}

/** 달력 일수 차이(to - from). 입력은 YYYY-MM-DD, 타임존 무관. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const [ty, tm, td] = toYmd.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

export function isScheduleDelayed(m: ScheduleInput, todayStr: string): boolean {
  const stage = deriveStage(m)
  if (stage === 'completed') return false
  if (m.status === 'delayed') return true
  if (m.due_date && m.due_date < todayStr) return true
  return !!m.start_date && m.start_date < todayStr && stage === 'not_started'
}

export function isIssuePending(m: Pick<Milestone, 'bottleneck_type' | 'bottleneck_reviewed_at'>): boolean {
  return !!m.bottleneck_type && !m.bottleneck_reviewed_at
}

export function dueBadge(m: ScheduleInput, todayStr: string): DueBadge {
  if (deriveStage(m) === 'completed') return { label: '완료', tone: 'muted' }
  if (!m.due_date) return null
  const d = daysBetween(todayStr, m.due_date)
  if (d < 0) return { label: `D+${-d} 지연`, tone: 'over' }
  if (isScheduleDelayed(m, todayStr)) {
    // 시작 지연은 시작일이 지난 미시작 항목에만. 그 외 지연(예: 이슈 검토중인 진행중 항목)은 '지연'.
    const startLate = deriveStage(m) === 'not_started' && !!m.start_date && m.start_date < todayStr
    return { label: startLate ? '시작 지연' : '지연', tone: 'over' }
  }
  if (d === 0) return { label: 'D-DAY', tone: 'soon' }
  if (d <= 7) return { label: `D-${d}`, tone: 'soon' }
  return { label: `D-${d}`, tone: 'ok' }
}

export function matchesFilter(m: Milestone, filter: ViewFilter, todayStr: string): boolean {
  if (filter === 'all') return true
  const stage = deriveStage(m)
  const delayed = isScheduleDelayed(m, todayStr)
  switch (filter) {
    case 'prog': return stage === 'in_progress' && !delayed
    case 'over': return delayed
    case 'todo': return stage === 'not_started' && !delayed
    case 'done': return stage === 'completed'
  }
}

export function summarize(ms: Milestone[], todayStr: string): ViewSummary {
  const s: ViewSummary = { total: ms.length, done: 0, prog: 0, over: 0, not: 0, pending: 0, thisWeek: 0 }
  for (const m of ms) {
    const stage = deriveStage(m)
    const completed = stage === 'completed'
    if (completed) s.done++
    else if (isScheduleDelayed(m, todayStr)) s.over++
    else if (stage === 'in_progress') s.prog++
    else s.not++
    if (!completed) {
      if (isIssuePending(m)) s.pending++
      if (m.due_date) {
        const d = daysBetween(todayStr, m.due_date)
        if (d >= 0 && d <= 6) s.thisWeek++
      }
    }
  }
  return s
}

export function groupByParent(ms: Milestone[]): MilestoneGroup[] {
  const ids = new Set(ms.map(m => m.id))
  const childrenOf = new Map<string, Milestone[]>()
  for (const m of ms) {
    if (m.parent_milestone_id && ids.has(m.parent_milestone_id)) {
      const list = childrenOf.get(m.parent_milestone_id) ?? []
      list.push(m)
      childrenOf.set(m.parent_milestone_id, list)
    }
  }
  const loose: Milestone[] = []
  const groups: MilestoneGroup[] = []
  for (const m of ms) {
    if (m.parent_milestone_id && ids.has(m.parent_milestone_id)) continue
    if (m.parent_milestone_id) { loose.push(m); continue }
    const items = childrenOf.get(m.id)
    if (items) groups.push({ parent: m, items })
    else loose.push(m)
  }
  return loose.length ? [{ parent: null, items: loose }, ...groups] : groups
}

function fmtMD(s: string): string {
  if (!s) return ''
  const [, m, d] = s.split('-').map(Number)
  return `${m}/${d}`
}

export function fmtRange(m: Pick<Milestone, 'start_date' | 'due_date'>): string {
  if (m.start_date) return `${fmtMD(m.start_date)} – ${fmtMD(m.due_date ?? '')}`
  return m.due_date ? `~${fmtMD(m.due_date)}` : ''
}
