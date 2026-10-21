import { describe, it, expect } from 'vitest'
import {
  RECAP_ACTIONS,
  buildDraftBlocks,
  buildRecapText,
  buildSentBlocks,
  extractAiSummary,
  toSlackMrkdwn,
  truncateForSlack,
} from '@/lib/recap/format'

describe('extractAiSummary', () => {
  it('returns only the part after the divider', () => {
    const notes = '내 메모\n\n---\n\n**🤖 AI 요약**\n\n- 요약 하나'
    expect(extractAiSummary(notes)).toBe('- 요약 하나')
  })
  it('returns the whole note when there is no divider', () => {
    expect(extractAiSummary('내 메모만 있어요')).toBe('내 메모만 있어요')
  })
  it('tolerates emphasis and whitespace variants of the divider', () => {
    const notes = '메모\n---\n***🤖 AI 요약***\n본문'
    expect(extractAiSummary(notes)).toBe('본문')
  })
})

describe('toSlackMrkdwn', () => {
  it('converts bold', () => expect(toSlackMrkdwn('**a**')).toBe('*a*'))
  it('converts list bullets', () => {
    expect(toSlackMrkdwn('- x\n* y')).toBe('• x\n• y')
  })
  it('converts links', () => {
    expect(toSlackMrkdwn('[링크](https://e.com)')).toBe('<https://e.com|링크>')
  })
  it('converts headings to bold', () => expect(toSlackMrkdwn('## 제목')).toBe('*제목*'))
  it('strips blockquote markers', () => expect(toSlackMrkdwn('> 인용')).toBe('인용'))
})

describe('truncateForSlack', () => {
  it('keeps short text', () => expect(truncateForSlack('a'.repeat(2900))).toBe('a'.repeat(2900)))
  it('truncates long text with ellipsis', () => {
    const out = truncateForSlack('a'.repeat(5000))
    expect(out.length).toBeLessThanOrEqual(2901)
    expect(out.endsWith('…')).toBe(true)
  })
})

const base = {
  championName: '홍길동',
  sessionTitle: '1on1',
  sessionDate: '2026-10-21',
  notes: '메모\n\n---\n\n**🤖 AI 요약**\n\n- 핵심 **내용**',
  noteUrl: 'https://app.example.com/sessions/1',
}

describe('buildRecapText', () => {
  it('lists only incomplete action items, numbered, with link', () => {
    const t = buildRecapText({
      ...base,
      actionItems: [
        { body: '할 일 A', is_completed: false },
        { body: '끝난 일', is_completed: true },
        { body: '할 일 B', is_completed: false },
      ],
    })
    expect(t).toContain('*요약*')
    expect(t).toContain('*액션 아이템*')
    expect(t).toContain('1. 할 일 A')
    expect(t).toContain('2. 할 일 B')
    expect(t).not.toContain('끝난 일')
    expect(t).toContain('https://app.example.com/sessions/1')
    expect(t).toContain('홍길동')
    expect(t.length).toBeLessThanOrEqual(3000)
  })
  it('omits the action section when all are complete', () => {
    const t = buildRecapText({ ...base, actionItems: [{ body: '끝', is_completed: true }] })
    expect(t).not.toContain('액션 아이템')
    expect(t).toContain('*요약*')
  })
  it('stays within 3000 chars for huge notes', () => {
    const t = buildRecapText({
      ...base,
      notes: 'x'.repeat(10000),
      actionItems: Array.from({ length: 5 }, (_, i) => ({ body: `일 ${i}`, is_completed: false })),
    })
    expect(t.length).toBeLessThanOrEqual(3000)
    expect(t).toContain('https://app.example.com/sessions/1')
  })
})

describe('buildDraftBlocks', () => {
  const input = {
    sessionId: 'sess-1',
    championName: '홍길동',
    sessionTitle: null,
    sessionDate: '2026-10-21',
    recapText: 'y'.repeat(5000),
    previouslySent: false,
  }
  type B = { type: string; elements?: Array<Record<string, unknown>>; text?: { text: string } }
  it('has send/edit buttons with exact ids and value', () => {
    const blocks = buildDraftBlocks(input) as B[]
    const actions = blocks.find((b) => b.type === 'actions')!
    expect(actions.elements).toHaveLength(2)
    expect(actions.elements![0]).toMatchObject({ action_id: 'recap_send', value: 'sess-1', style: 'primary' })
    expect(actions.elements![1]).toMatchObject({ action_id: 'recap_edit', value: 'sess-1' })
    expect((actions.elements![0].text as { text: string }).text).toBe('챔피언에게 발송')
    expect((actions.elements![1].text as { text: string }).text).toBe('수정 후 발송')
  })
  it('shows previously-sent notice only when previouslySent', () => {
    const has = (b: B[]) => JSON.stringify(b).includes('이전 recap이 이미 발송됐어요')
    expect(has(buildDraftBlocks(input) as B[])).toBe(false)
    expect(has(buildDraftBlocks({ ...input, previouslySent: true }) as B[])).toBe(true)
  })
  it('keeps every section text within 3000 chars', () => {
    for (const b of buildDraftBlocks(input) as B[]) {
      if (b.type === 'section') expect(b.text!.text.length).toBeLessThanOrEqual(3000)
    }
  })
})

describe('buildSentBlocks', () => {
  it('has no actions block and shows the sent message', () => {
    const blocks = buildSentBlocks({ championName: '홍길동', sentByLabel: '관리자', sentAt: new Date('2026-10-21T01:00:00Z') })
    expect(blocks.some((b) => b.type === 'actions')).toBe(false)
    expect(JSON.stringify(blocks)).toContain('✅ 관리자님이 홍길동 챔피언에게 발송했어요')
  })
})

describe('RECAP_ACTIONS', () => {
  it('has exact ids', () => {
    expect(RECAP_ACTIONS).toEqual({ send: 'recap_send', edit: 'recap_edit', editSubmit: 'recap_edit_submit' })
  })
})
