import { describe, it, expect } from 'vitest'
import { buildSummaryPrompt } from '@/lib/audio-pipeline/summarize'

describe('buildSummaryPrompt', () => {
  const transcript = '오늘은 온보딩 일정에 대해 이야기했습니다.'
  const prompt = buildSummaryPrompt(transcript)

  it('includes the transcript', () => {
    expect(prompt).toContain(transcript)
  })

  it('includes the four section titles and numbered subheading example', () => {
    expect(prompt).toContain('## 🗣️ 논의 주제')
    expect(prompt).toContain('## 💬 피드백')
    expect(prompt).toContain('## 🤨 고민·요청 사항')
    expect(prompt).toContain('## 🤝 합의 사항')
    expect(prompt).toContain('### 1.')
  })

  it('states the prohibitions', () => {
    expect(prompt).toContain('표')
    expect(prompt).toContain('수평선')
    expect(prompt).toContain('---')
    expect(prompt).toContain('체크박스')
    expect(prompt).toContain('- [ ]')
    expect(prompt).toContain('코드 블록')
    expect(prompt).toContain('인용문')
  })

  it('states content rules', () => {
    expect(prompt).toContain('내용이 없는 섹션은 생략')
    expect(prompt).toContain('논의 주제는 제외')
    expect(prompt).toContain('화자 이름을 지어내지 않')
    expect(prompt).toContain('전사에 없는 내용을 추가하지 않')
    expect(prompt).toContain('JSON으로만 응답')
  })

  it('describes the action item format', () => {
    expect(prompt).toContain('"actionItems"')
    expect(prompt).toContain('담당자: 할 일')
    expect(prompt).toContain('markdown 문법 없이')
  })
})
