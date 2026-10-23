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

describe('escaping / injection', () => {
  const evil = ['<!channel>', '<!here>', '<@U123>', '<https://evil|로그인>']
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const mk = (over: Partial<Parameters<typeof buildRecapText>[0]>) =>
    buildRecapText({ ...base, actionItems: [], ...over })

  for (const e of evil) {
    it(`escapes ${e} everywhere`, () => {
      expect(toSlackMrkdwn(e)).toBe(esc(e))
      const asSummary = mk({ notes: `--\n\n---\n\n**🤖 AI 요약**\n\n${e}` })
      expect(asSummary).toContain(esc(e))
      expect(asSummary).not.toContain(e)
      const asName = mk({ championName: e })
      expect(asName).toContain(esc(e))
      expect(asName).not.toContain(e)
      const asTitle = mk({ sessionTitle: e })
      expect(asTitle).toContain(esc(e))
      expect(asTitle).not.toContain(e)
      const asItem = mk({ actionItems: [{ body: e, is_completed: false }] })
      expect(asItem).toContain(`1. ${esc(e)}`)
      expect(asItem).not.toContain(e)
      const sent = JSON.stringify(
        buildSentBlocks({ championName: e, sentByLabel: e, sentAt: new Date(0) }),
      )
      expect(sent).toContain(`✅ ${esc(e)}님이 ${esc(e)} 챔피언에게`)
      expect(sent).not.toContain(e)
      const draft = JSON.stringify(
        buildDraftBlocks({ sessionId: 's', championName: e, sessionTitle: e, sessionDate: 'd', recapText: 'x', previouslySent: false }),
      )
      expect(draft).not.toContain(`"mrkdwn","text":"d ${e}`)
    })
  }
  it('escapes & and keeps real links as angle links', () => {
    expect(toSlackMrkdwn('A & B')).toBe('A &amp; B')
    expect(toSlackMrkdwn('[a&b](https://e.com/?x=1&y=2)')).toBe('<https://e.com/?x=1&amp;y=2|a&amp;b>')
    expect(toSlackMrkdwn('> <!here>')).toBe('&lt;!here&gt;')
  })
})

describe('recap budget', () => {
  it('keeps link and stays <= 2900 with many long action items', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ body: `긴 일 ${i} ` + '가'.repeat(400), is_completed: false }))
    const t = buildRecapText({ ...base, actionItems: items })
    expect(t.length).toBeLessThanOrEqual(2900)
    expect(t).toContain(base.noteUrl)
    expect(t).toContain('외 20건')
    expect(t.endsWith(base.noteUrl)).toBe(true)
  })
  it('draft shows exactly the recap text (parity)', () => {
    const t = buildRecapText({ ...base, notes: 'x '.repeat(5000), actionItems: [{ body: 'a', is_completed: false }] })
    const blocks = buildDraftBlocks({ sessionId: 's', championName: 'n', sessionTitle: null, sessionDate: 'd', recapText: t, previouslySent: false })
    const sec = blocks.find((b) => b.type === 'section') as { text: { text: string } }
    expect(sec.text.text).toBe(t)
    expect(sec.text.text).toContain(base.noteUrl)
  })
})

describe('truncateForSlack structure-aware', () => {
  it('does not cut inside a link', () => {
    const text = 'aaa <https://example.com/path|링크 텍스트> bbb'
    const out = truncateForSlack(text, 20)
    expect(out).toBe('aaa…')
  })
  it('does not cut inside an entity', () => {
    const out = truncateForSlack('abcd&amp;efgh', 7)
    expect(out).toBe('abcd…')
    expect(truncateForSlack('abcdef&amp;gh', 11)).toBe('abcdef&amp;…')
  })
  it('drops an odd bold marker', () => {
    expect(truncateForSlack('*bold text here* tail', 8)).toBe('bold…')
  })
  it('does not split a surrogate pair', () => {
    const out = truncateForSlack('😀'.repeat(10), 5)
    expect(out).toBe('😀😀…')
  })
})

describe('buildSentBlocks recipient', () => {
  it('shows the Slack DM recipient mention when given, omits it for odd ids', () => {
    const base = { championName: 'c', sentByLabel: 's', sentAt: new Date(0) }
    expect(JSON.stringify(buildSentBlocks({ ...base, recipientSlackId: 'U0ABC123' }))).toContain('수신: <@U0ABC123> (Slack DM)')
    expect(JSON.stringify(buildSentBlocks({ ...base, recipientSlackId: 'x> <!channel' }))).not.toContain('수신')
    expect(JSON.stringify(buildSentBlocks({ ...base, recipientSlackId: 'U0ABC123', destination: 'group' }))).toContain('(그룹 DM)')
    expect(JSON.stringify(buildSentBlocks(base))).not.toContain('수신')
  })
})

describe('buildSentBlocks channel destination', () => {
  const base = { championName: 'c', sentByLabel: 's', sentAt: new Date(0) }
  it('shows the channel mention for channel sends', () => {
    const s = JSON.stringify(buildSentBlocks({ ...base, recipientSlackId: 'U0ABC123', destination: 'channel', channelId: 'C0123ABCD' }))
    expect(s).toContain('수신: <#C0123ABCD> (채널)')
    expect(s).not.toContain('<@U0ABC123>')
  })
  it('omits the recipient for an invalid or missing channel id', () => {
    expect(JSON.stringify(buildSentBlocks({ ...base, destination: 'channel', channelId: 'C1> <!channel' }))).not.toContain('수신')
    expect(JSON.stringify(buildSentBlocks({ ...base, destination: 'channel' }))).not.toContain('수신')
  })
  it('keeps the DM wording for group and dm', () => {
    expect(JSON.stringify(buildSentBlocks({ ...base, recipientSlackId: 'U0ABC123', destination: 'dm' }))).toContain('수신: <@U0ABC123> (Slack DM)')
    expect(JSON.stringify(buildSentBlocks({ ...base, recipientSlackId: 'U0ABC123', destination: 'group' }))).toContain('수신: <@U0ABC123> (그룹 DM)')
  })
})

describe('buildSentBlocks time', () => {
  it('renders KST deterministically', () => {
    const s = JSON.stringify(buildSentBlocks({ championName: 'c', sentByLabel: 's', sentAt: new Date('2026-10-21T01:05:00Z') }))
    expect(s).toContain('(2026-10-21 10:05 KST)')
  })
})

describe('recap budget after escaping', () => {
  const cases: Record<string, string> = {
    amp: '&amp; '.repeat(25),
    angle: '<>'.repeat(75),
  }
  for (const [k, body] of Object.entries(cases)) {
    it(`stays <= 2900 with link last and draft parity (${k})`, () => {
      const items = Array.from({ length: 10 }, () => ({ body: body.slice(0, 150), is_completed: false }))
      const t = buildRecapText({ ...base, notes: 'z '.repeat(4000), actionItems: items })
      expect(t.length).toBeLessThanOrEqual(2900)
      expect(t.endsWith(base.noteUrl)).toBe(true)
      const blocks = buildDraftBlocks({ sessionId: 's', championName: 'n', sessionTitle: null, sessionDate: 'd', recapText: t, previouslySent: false })
      const sec = blocks.find((b) => b.type === 'section') as { text: { text: string } }
      expect(sec.text.text).toBe(t)
    })
  }
  it('keeps link when name/title/items are all huge and escape-heavy', () => {
    const t = buildRecapText({
      ...base,
      championName: '&'.repeat(500),
      sessionTitle: '<'.repeat(500),
      actionItems: Array.from({ length: 40 }, () => ({ body: '&'.repeat(1000), is_completed: false })),
    })
    expect(t.length).toBeLessThanOrEqual(2900)
    expect(t.endsWith(base.noteUrl)).toBe(true)
  })
  it('does not strip odd characters from a short name', () => {
    const t = buildRecapText({ ...base, championName: 'Q&A *팀', actionItems: [] })
    expect(t).toContain('Q&amp;A *팀 챔피언님')
  })
})
