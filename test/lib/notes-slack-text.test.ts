import { describe, it, expect } from 'vitest'
import { notesToSlackText } from '@/lib/notes/slackText'
import { AI_DIVIDER } from '@/lib/audio-pipeline/notes'

const HR = '──────────'

const SECTION_NOTE = `## 🗣️ 논의 주제
### 1. 주제 제목
- 핵심 내용
  - 세부 내용

## 💬 피드백
- 내용

## 🤝 합의 사항
1. 합의 내용`

describe('notesToSlackText', () => {
  it('(a) converts the section structure', () => {
    expect(notesToSlackText(SECTION_NOTE)).toBe(
      `*🗣️ 논의 주제*
*1. 주제 제목*
• 핵심 내용
  ◦ 세부 내용

*💬 피드백*
• 내용

*🤝 합의 사항*
1. 합의 내용`,
    )
  })

  it('(b) converts the AI divider, original and editor round-trip variants', () => {
    const expected = `내 메모\n\n${HR}\n*🤖 AI 요약*\n\n*💬 피드백*\n• 내용`
    expect(notesToSlackText(`내 메모${AI_DIVIDER}## 💬 피드백\n- 내용`)).toBe(expected)
    expect(notesToSlackText('내 메모\n\n---\n\n*🤖 AI 요약*\n\n## 💬 피드백\n- 내용')).toBe(expected)
    expect(notesToSlackText('내 메모\n\n---\n\n_🤖 AI 요약_\n\n## 💬 피드백\n- 내용')).toBe(expected)
  })

  it('(c) converts task list items', () => {
    expect(notesToSlackText('- [ ] 할 일\n- [x] 한 일\n- [X] 또 한 일')).toBe('☐ 할 일\n☑ 한 일\n☑ 또 한 일')
  })

  it('(d) converts links, images, quotes and backticks', () => {
    expect(notesToSlackText('[문서](https://a.com/x)')).toBe('문서 (https://a.com/x)')
    expect(notesToSlackText('![화면](https://a.com/i.png)')).toBe('화면 (https://a.com/i.png)')
    expect(notesToSlackText('> 인용문이에요\n> - 인용 불릿')).toBe('인용문이에요\n• 인용 불릿')
    expect(notesToSlackText('`code_name` 사용')).toBe('code_name 사용')
    expect(notesToSlackText('***\n본문\n---')).toBe(`${HR}\n본문\n${HR}`)
  })

  it('(e) leaves & < > raw', () => {
    expect(notesToSlackText('A & B < C > D')).toBe('A & B < C > D')
  })

  it('(f) leaves no markdown syntax', () => {
    const fixtures = [
      SECTION_NOTE,
      `메모${AI_DIVIDER}${SECTION_NOTE}`,
      '- [ ] a\n- [x] b\n**굵게** [l](http://x.y) ![i](http://x.y/i.png)\n---\n> q\n## **제목**',
    ]
    for (const f of fixtures) {
      const out = notesToSlackText(f)
      for (const bad of ['##', '**', '---', '](', '- [']) expect(out).not.toContain(bad)
    }
  })

  it('(g) returns empty string for empty or whitespace', () => {
    expect(notesToSlackText('')).toBe('')
    expect(notesToSlackText('  \n\t\n ')).toBe('')
  })

  it('(h) collapses blank lines', () => {
    expect(notesToSlackText('a\n\n\n\n\nb\n\n')).toBe('a\n\nb')
  })

  it('(i) handles nested bullet indentation variants', () => {
    expect(notesToSlackText('- a\n  - b\n    - c')).toBe('• a\n  ◦ b\n    ◦ c')
    expect(notesToSlackText('- a\n    - b')).toBe('• a\n    ◦ b')
    expect(notesToSlackText('- a\n\t- b')).toBe('• a\n    ◦ b')
    expect(notesToSlackText('1. a\n   - b\n2. c')).toBe('1. a\n   ◦ b\n2. c')
    expect(notesToSlackText('* a\n  * b')).toBe('• a\n  ◦ b')
  })

  it('(j) handles inline emphasis precedence safely', () => {
    expect(notesToSlackText('## **굵은** 제목')).toBe('*굵은 제목*')
    expect(notesToSlackText('**내용**을 확인')).toBe('*내용*을 확인')
    expect(notesToSlackText('- **핵심**: 설명')).toBe('• *핵심*: 설명')
    expect(notesToSlackText('**굵게**와 *기울임*')).toBe('*굵게*와 _기울임_')
    expect(notesToSlackText('__굵게__ 와 _기울임_')).toBe('*굵게* 와 _기울임_')
    expect(notesToSlackText('snake_case_name 과 2*3')).toBe('snake_case_name 과 2*3')
    expect(notesToSlackText('a*b*c 그리고 my_var_x')).toBe('a*b*c 그리고 my_var_x')
    expect(notesToSlackText('`a*b*` 와 `**x**`')).toBe('a*b* 와 **x**')
  })
})
