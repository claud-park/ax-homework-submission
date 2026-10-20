import { describe, it, expect } from 'vitest'
import type { Milestone } from '@/lib/types'
import {
  deriveStage, isScheduleDelayed, dueBadge, matchesFilter, summarize, groupByParent,
} from '@/lib/milestone-view'

const base = { id: 'm', status: 'not_started', is_manual_progress: false, is_manual_completed: false, start_date: '2026-10-13', due_date: '2026-10-17',
  bottleneck_type: null, bottleneck_reviewed_at: null, parent_milestone_id: null, publish_status: 'published' } as Milestone
const today = '2026-10-20'

describe('deriveStage', () => {
  it('delayed + manual progress → in_progress', () =>
    expect(deriveStage({ status: 'delayed', is_manual_progress: true, is_manual_completed: false })).toBe('in_progress'))
  it('delayed without flags → not_started', () =>
    expect(deriveStage({ status: 'delayed', is_manual_progress: false, is_manual_completed: false })).toBe('not_started'))
  // 서버는 due_date가 없으면 status를 다시 계산하지 않으므로 플래그가 우선한다.
  it('manual progress wins over stale not_started status', () =>
    expect(deriveStage({ status: 'not_started', is_manual_progress: true, is_manual_completed: false })).toBe('in_progress'))
  it('manual completed wins over stale not_started status', () =>
    expect(deriveStage({ status: 'not_started', is_manual_progress: false, is_manual_completed: true })).toBe('completed'))
  it('status fallback when no flags', () => {
    expect(deriveStage({ status: 'completed', is_manual_progress: false, is_manual_completed: false })).toBe('completed')
    expect(deriveStage({ status: 'in_progress', is_manual_progress: false, is_manual_completed: false })).toBe('in_progress')
  })
})
describe('isScheduleDelayed', () => {
  it('start passed and not started, due in future → true', () =>
    expect(isScheduleDelayed({ ...base, due_date: '2026-10-30' }, today)).toBe(true))
  it('completed never delayed', () => expect(isScheduleDelayed({ ...base, status: 'completed' }, today)).toBe(false))
  it('no due date, start passed, manually started → not delayed', () =>
    expect(isScheduleDelayed({ ...base, due_date: null, is_manual_progress: true }, today)).toBe(false))
})
describe('dueBadge', () => {
  it('overdue → D+n 지연 over', () => expect(dueBadge(base, today)).toEqual({ label: 'D+3 지연', tone: 'over' }))
  it('start passed, due ahead → 시작 지연', () => expect(dueBadge({ ...base, due_date: '2026-10-30' }, today)).toEqual({ label: '시작 지연', tone: 'over' }))
  it('in_progress with pending issue, due ahead → 지연 (not 시작 지연)', () =>
    expect(dueBadge({ ...base, status: 'delayed', is_manual_progress: true, bottleneck_type: 'technical', due_date: '2026-10-30' } as Milestone, today))
      .toEqual({ label: '지연', tone: 'over' }))
  it('due today → D-DAY soon', () => expect(dueBadge({ ...base, start_date: today, due_date: today }, today)).toEqual({ label: 'D-DAY', tone: 'soon' }))
  it('due in 18 days → D-18 ok', () => expect(dueBadge({ ...base, start_date: '2026-10-27', due_date: '2026-11-07' }, today)).toEqual({ label: 'D-18', tone: 'ok' }))
  it('completed → 완료 muted; no due → null', () => {
    expect(dueBadge({ ...base, status: 'completed' }, today)).toEqual({ label: '완료', tone: 'muted' })
    expect(dueBadge({ ...base, is_manual_completed: true }, today)).toEqual({ label: '완료', tone: 'muted' })
    expect(dueBadge({ ...base, due_date: null, start_date: null }, today)).toBeNull()
  })
})
describe('matchesFilter / summarize', () => {
  const ms = [
    { ...base, id: 'done', status: 'completed' },
    { ...base, id: 'prog', status: 'in_progress', is_manual_progress: true, start_date: '2026-10-06', due_date: '2026-10-24' },
    { ...base, id: 'overProg', status: 'delayed', is_manual_progress: true, due_date: '2026-10-15', bottleneck_type: 'technical' },
    { ...base, id: 'overNot' },
    { ...base, id: 'todo', start_date: '2026-10-27', due_date: '2026-11-07' },
  ] as Milestone[]
  it('over includes pending issue and start-passed not-started; todo/prog exclude delayed', () => {
    expect(ms.filter(m => matchesFilter(m, 'over', today)).map(m => m.id)).toEqual(['overProg', 'overNot'])
    expect(ms.filter(m => matchesFilter(m, 'prog', today)).map(m => m.id)).toEqual(['prog'])
    expect(ms.filter(m => matchesFilter(m, 'todo', today)).map(m => m.id)).toEqual(['todo'])
  })
  it('summary partitions sum to total', () => {
    const s = summarize(ms, today)
    expect(s).toEqual({ total: 5, done: 1, prog: 1, over: 2, not: 1, pending: 1, thisWeek: 1 })
  })
})
describe('groupByParent', () => {
  it('parents with children become groups; childless top-level go to a leading null group', () => {
    const p = { ...base, id: 'p' }, c1 = { ...base, id: 'c1', parent_milestone_id: 'p' }, leaf = { ...base, id: 'leaf' }
    expect(groupByParent([p, c1, leaf] as Milestone[])).toEqual([{ parent: null, items: [leaf] }, { parent: p, items: [c1] }])
  })
})
