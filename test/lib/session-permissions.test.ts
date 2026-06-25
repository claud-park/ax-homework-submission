import { describe, it, expect } from 'vitest'
import { allowedSessionUpdateFields, allowedActionItemUpdateFields } from '@/lib/sessions/permissions'

describe('allowedSessionUpdateFields', () => {
  it('admin은 title/notes/session_date 모두 허용', () => {
    expect(allowedSessionUpdateFields('admin')).toEqual(['title', 'notes', 'session_date'])
  })
  it('owner(champion)는 notes만 허용', () => {
    expect(allowedSessionUpdateFields('owner')).toEqual(['notes'])
  })
})

describe('allowedActionItemUpdateFields', () => {
  it('admin은 body/display_order/is_completed 허용', () => {
    expect(allowedActionItemUpdateFields('admin')).toEqual(['body', 'display_order', 'is_completed'])
  })
  it('owner(champion)는 body/is_completed만 허용(reorder 제외)', () => {
    expect(allowedActionItemUpdateFields('owner')).toEqual(['body', 'is_completed'])
  })
})
