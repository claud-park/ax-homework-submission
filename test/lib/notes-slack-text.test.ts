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

  it('(f) leaves no markdown syntax and matches exact output', () => {
    const fixtures: Array<[string, string]> = [
      [SECTION_NOTE, notesToSlackText(SECTION_NOTE)],
      [`메모${AI_DIVIDER}${SECTION_NOTE}`, `메모\n\n${HR}\n*🤖 AI 요약*\n\n${notesToSlackText(SECTION_NOTE)}`],
      [
        '- [ ] a\n- [x] b\n**굵게** [l](http://x.y) ![i](http://x.y/i.png)\n---\n> q\n## **제목**',
        `☐ a\n☑ b\n*굵게* l (http://x.y) i (http://x.y/i.png)\n${HR}\nq\n*제목*`,
      ],
    ]
    for (const [input, expected] of fixtures) {
      const out = notesToSlackText(input)
      expect(out).toBe(expected)
      for (const bad of ['##', '**', '---', '](', '- [']) expect(out).not.toContain(bad)
    }
    expect(notesToSlackText(SECTION_NOTE).startsWith('*🗣️ 논의 주제*\n*1. 주제 제목*\n• 핵심 내용')).toBe(true)
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
    expect(notesToSlackText('**내용**을 확인')).toBe('*내용*\u200B을 확인')
    expect(notesToSlackText('- **핵심**: 설명')).toBe('• *핵심*: 설명')
    expect(notesToSlackText('**굵게**와 *기울임*')).toBe('*굵게*\u200B와 _기울임_')
    expect(notesToSlackText('__굵게__ 와 _기울임_')).toBe('*굵게* 와 _기울임_')
    expect(notesToSlackText('snake_case_name 과 2*3')).toBe('snake_case_name 과 2*3')
    expect(notesToSlackText('a*b*c 그리고 my_var_x')).toBe('a*b*c 그리고 my_var_x')
    expect(notesToSlackText('`a*b*` 와 `**x**`')).toBe('a*b* 와 **x**')
  })
  it('pads bold/italic spans with U+200B only next to letters/digits', () => {
    expect(notesToSlackText('A사**내용**')).toBe('A사\u200B*내용*')
    expect(notesToSlackText('A사**내용**을')).toBe('A사\u200B*내용*\u200B을')
    expect(notesToSlackText('**a**, **b** c. (**d**)')).toBe('*a*, *b* c. (*d*)')
    expect(notesToSlackText('**시작** 중간 **끝**')).toBe('*시작* 중간 *끝*')
    expect(notesToSlackText('**a** **b**')).toBe('*a* *b*')
    expect(notesToSlackText('**가**나**다**')).toBe('*가*\u200B나\u200B*다*')
    expect(notesToSlackText('_x_를 확인')).toBe('_x_\u200B를 확인')
    expect(notesToSlackText('*x*를 확인')).toBe('_x_\u200B를 확인')
    expect(notesToSlackText('- **내용**을')).toBe('• *내용*\u200B을')
  })

  it('keeps underscores inside URLs', () => {
    expect(notesToSlackText('[문서](https://a.com/a_b_c)')).toBe('문서 (https://a.com/a_b_c)')
    expect(notesToSlackText('보세요 https://a.com/my_page_x/y_z 입니다')).toBe(
      '보세요 https://a.com/my_page_x/y_z 입니다',
    )
    expect(notesToSlackText('https://a.com/_x_/')).toBe('https://a.com/_x_/')
  })

  it('documents current behaviour for link labels with brackets (unsupported)', () => {
    expect(notesToSlackText('[문서 [v2]](https://a.com/x)')).toBe('[문서 [v2]](https://a.com/x)')
  })

  it('falls back to line-level conversion when the inline regex cannot be built', () => {
    const failing = () => null
    const input = '## **제목**\n- **핵심**을 [l](http://x.y)\n  - 하위\n\n---\n1. 항목'
    expect(notesToSlackText(input, failing)).toBe(
      `*제목*\n• **핵심**을 [l](http://x.y)\n  ◦ 하위\n\n${HR}\n1. 항목`,
    )
    expect(notesToSlackText(`내${AI_DIVIDER}요약`, failing)).toBe(`내\n\n${HR}\n*🤖 AI 요약*\n\n요약`)
  })
  it('unescapes CommonMark backslash escapes', () => {
    expect(notesToSlackText('\\[중요\\] 자료')).toBe('[중요] 자료')
    expect(notesToSlackText('A\\*B')).toBe('A*B')
    expect(notesToSlackText('\\*별표\\*')).toBe('*별표*')
    expect(notesToSlackText('\\- 대시')).toBe('- 대시')
    expect(notesToSlackText('1\\. 시작')).toBe('1. 시작')
    expect(notesToSlackText('\\# 해시')).toBe('# 해시')
    expect(notesToSlackText('snake\\_case\\_name')).toBe('snake_case_name')
    expect(notesToSlackText('\\`x\\` 입니다')).toBe('`x` 입니다')
    expect(notesToSlackText('a\\\\b')).toBe('a\\b')
    expect(notesToSlackText('끝\\')).toBe('끝\\')
    expect(notesToSlackText('\\가나')).toBe('\\가나')
    expect(notesToSlackText('[라벨\\_x](http://a.com)')).toBe('라벨_x (http://a.com)')
  })

  it('unescapes in the regex-unavailable fallback', () => {
    expect(notesToSlackText('\\- x\n\\[a\\]\n1\\. y', () => null)).toBe('- x\n[a]\n1. y')
  })

  it('converts a TipTap-style saved note', () => {
    const saved = '## 💬 피드백\n- **중요** \\[긴급\\] A\\*B\n- \\- 대시\n\n1\\. 시작\n\n\\_x\\_ 와 \\*y\\*'
    expect(notesToSlackText(saved)).toBe(
      '*💬 피드백*\n• *중요* [긴급] A*B\n• - 대시\n\n1. 시작\n\n_x_ 와 *y*',
    )
  })
})
