import { describe, it, expect } from 'vitest'
import { isRecapEligible } from '@/lib/recap/eligibility'

describe('isRecapEligible', () => {
  it('done 세션은 가능', () => {
    expect(isRecapEligible({ processing_status: 'done', notes: null })).toBe(true)
  })
  it('녹음 없이 노트만 올린 세션(idle + 노트 있음)은 가능', () => {
    expect(isRecapEligible({ processing_status: 'idle', notes: '미팅 메모' })).toBe(true)
  })
  it('idle이어도 노트가 비어 있거나 공백뿐이면 불가', () => {
    expect(isRecapEligible({ processing_status: 'idle', notes: null })).toBe(false)
    expect(isRecapEligible({ processing_status: 'idle', notes: '  \n ' })).toBe(false)
  })
  it('처리 중·error·low_quality는 노트가 있어도 불가', () => {
    for (const s of ['uploading', 'transcribing', 'summarizing', 'error', 'low_quality']) {
      expect(isRecapEligible({ processing_status: s, notes: '메모' })).toBe(false)
    }
  })
})
