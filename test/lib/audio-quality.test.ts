// test/lib/audio-quality.test.ts
import { describe, it, expect } from 'vitest'
import { assessTranscript } from '@/lib/audio/quality'

const BAD_REPEAT = Array(40).fill('현금으로 따시면 됩니다').join(' ')              // 세션 A 환각
const BAD_COUNT = Array(60).fill(0).map((_, i) => `${i}.5cm로 잘라줍니다`).join(' ') // 세션 B 환각
const GOOD = '오늘 미팅에서는 상세페이지 자동화 아이디어를 논의했다. 디자이너 리소스를 줄일 수 있지만 담당자가 한 명이라 과한 투자일 수 있다. Claude Code 활용을 추천했고 과제정의서를 두 벌로 나누기로 했다. 크롤링과 상세페이지 제작을 분리한다.'

describe('assessTranscript', () => {
  it('flags repetitive hallucination loops', () => {
    const r = assessTranscript(BAD_REPEAT, 1528)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('repetitive')
  })

  it('flags low char-per-second yield', () => {
    const r = assessTranscript('짧은 내용 조금', 1500) // 매우 낮은 chars/sec
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('low-yield')
  })

  it('flags counting-loop hallucination', () => {
    expect(assessTranscript(BAD_COUNT, 1472).ok).toBe(false)
  })

  it('accepts a normal varied transcript', () => {
    const r = assessTranscript(GOOD, 30)
    expect(r.ok).toBe(true)
    expect(r.reason).toBeUndefined()
  })

  it('flags empty transcript', () => {
    expect(assessTranscript('   ', 100).reason).toBe('empty')
  })

  it('accepts a varied transcript with unknown duration (durationSec=0)', () => {
    const r = assessTranscript(GOOD, 0)
    expect(r.ok).toBe(true)
    expect(r.reason).toBeUndefined()
  })
})
