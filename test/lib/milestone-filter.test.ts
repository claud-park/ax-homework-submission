import { describe, it, expect } from 'vitest'
import { filterMilestonesByCharter } from '@/lib/milestone-filter'

const m = (id: string, user_id: string, charter_submission_id: string | null) =>
  ({ id, user_id, charter_submission_id }) as any

describe('filterMilestonesByCharter', () => {
  it('한 챔피언이 여러 charter를 가질 때 해당 charter의 milestone만 반환한다', () => {
    const milestones = [
      m('m1', 'champion-a', 'charter-1'),
      m('m2', 'champion-a', 'charter-2'),
      m('m3', 'champion-a', 'charter-1'),
    ]
    const result = filterMilestonesByCharter(milestones, 'charter-1')
    expect(result.map(x => x.id)).toEqual(['m1', 'm3'])
  })

  it('기본값에서는 orphan(null FK) milestone을 포함하지 않는다', () => {
    const milestones = [m('m1', 'champion-a', null), m('m2', 'champion-a', 'charter-1')]
    expect(filterMilestonesByCharter(milestones, 'charter-1').map(x => x.id)).toEqual(['m2'])
  })

  it('includeOrphans=true면 orphan milestone을 첫 charter에 포함한다', () => {
    const milestones = [
      m('m1', 'champion-a', null),
      m('m2', 'champion-a', 'charter-1'),
      m('m3', 'champion-a', 'charter-2'),
    ]
    const result = filterMilestonesByCharter(milestones, 'charter-1', { includeOrphans: true })
    expect(result.map(x => x.id)).toEqual(['m1', 'm2'])
  })

  it('includeOrphans=true여도 다른 charter의 orphan 아닌 milestone은 제외한다', () => {
    const milestones = [m('m1', 'champion-a', null), m('m2', 'champion-a', 'charter-2')]
    expect(filterMilestonesByCharter(milestones, 'charter-1', { includeOrphans: true }).map(x => x.id)).toEqual(['m1'])
  })

  it('일치하는 milestone이 없으면 빈 배열을 반환한다', () => {
    const milestones = [m('m1', 'champion-a', 'charter-2')]
    expect(filterMilestonesByCharter(milestones, 'charter-1')).toEqual([])
  })
})
