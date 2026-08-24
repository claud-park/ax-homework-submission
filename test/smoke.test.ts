import { describe, it, expect } from 'vitest'
import { GET as milestonesLogGet, POST as milestonesLogPost } from '@/app/api/milestones/[id]/log/route'
import { DELETE as milestoneDelete } from '@/app/api/milestones/[id]/route'
import { GET as milestonesGet, POST as milestonesPost } from '@/app/api/milestones/route'
import { GET as weeklyUpdatesGet } from '@/app/api/weekly-updates/route'

describe('test infra', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})

describe('milestone route contracts (regression guard)', () => {
  it('exports the HTTP verbs the champion-milestone-sync skill depends on', () => {
    expect(typeof milestonesLogGet).toBe('function')
    expect(typeof milestonesLogPost).toBe('function')
    expect(typeof milestoneDelete).toBe('function')
    expect(typeof milestonesGet).toBe('function')
    expect(typeof milestonesPost).toBe('function')
  })
})

describe('weekly-updates route contract (regression guard)', () => {
  it('exports GET for the champion weekly progress UI', () => {
    expect(typeof weeklyUpdatesGet).toBe('function')
  })
})
