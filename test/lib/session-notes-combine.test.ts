import { describe, it, expect } from 'vitest'
import { combineSessionNotes, AI_DIVIDER } from '@/lib/sessions/processAudio'

describe('combineSessionNotes', () => {
  it('사용자 노트 없으면 요약만', () => {
    expect(combineSessionNotes('', 'SUMMARY')).toBe('SUMMARY')
  })
  it('사용자 노트 있으면 구분선으로 결합', () => {
    expect(combineSessionNotes('내 노트', 'SUMMARY')).toBe(`내 노트${AI_DIVIDER}SUMMARY`)
  })
  it('재처리: 기존 결합본(원래 ** 마커)에서 사용자 파트만 보존', () => {
    const prev = `내 노트${AI_DIVIDER}OLD`
    expect(combineSessionNotes(prev, 'NEW')).toBe(`내 노트${AI_DIVIDER}NEW`)
  })
  it('재처리: 에디터 라운드트립으로 _ 가 * 로 바뀐 구분선도 매칭', () => {
    const roundTripped = '내 노트\n\n---\n\n*🤖 AI 요약*\n\nOLD'
    expect(combineSessionNotes(roundTripped, 'NEW')).toBe(`내 노트${AI_DIVIDER}NEW`)
  })
})
