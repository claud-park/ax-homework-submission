import { describe, it, expect } from 'vitest'
import { TEMPLATES, getTemplate } from '@/lib/milestone-templates'
import { scheduleRelativeMilestones } from '@/lib/milestone-schedule'

describe('milestone templates', () => {
  it('exposes the three presets by id', () => {
    expect(TEMPLATES.map(t => t.id).sort()).toEqual(['launch', 'research', 'sprint'])
  })
  it('getTemplate returns relative milestones', () => {
    const t = getTemplate('launch')
    expect(t).toBeTruthy()
    expect(t!.milestones.length).toBeGreaterThan(0)
    expect(t!.milestones[0]).toHaveProperty('duration_days')
  })
  it('a template schedules into valid dated milestones', () => {
    const out = scheduleRelativeMilestones('2026-06-16', getTemplate('sprint')!.milestones)
    expect(out.every(m => m.start_date <= m.due_date)).toBe(true)
  })
})
