import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'
import { escapeSlack, unescapeSlack } from '@/lib/recap/format'
import {
  dispatchInteraction,
  handleRecapAction,
  parseInteractionPayload,
  resolveSignedBy,
  type RecapInteractionDeps,
} from '@/lib/recap/interactions'
import type { SendRecapResult } from '@/lib/recap/sendRecap'

const ADMIN_SLACK = 'UADMIN'
const DRAFT_CHANNEL = 'CADMIN'
const DRAFT_TS = '1700000000.000100'
// Draft text as posted by postRecapDraft (already Slack-escaped by buildRecapText).
const DRAFT_TEXT = '안녕하세요, A&amp;B 챔피언님!\n\n*요약*\n• 1 &lt; 2 &amp;&amp; 3 &gt; 2'

function makeDeps(result: SendRecapResult = { ok: true, championName: '홍길동', sentAt: new Date('2026-10-21T01:00:00Z') }) {
  const calls: string[] = []
  const slack = {
    chat: {
      update: vi.fn(async () => (calls.push('chat.update'), { ok: true })),
      postEphemeral: vi.fn(async () => (calls.push('chat.postEphemeral'), { ok: true })),
      postMessage: vi.fn(async () => (calls.push('chat.postMessage'), { ok: true })),
    },
    views: {
      open: vi.fn(async () => (calls.push('views.open'), { ok: true })),
    },
  }
  const sendRecap = vi.fn(async () => (calls.push('sendRecap'), result))
  const getAdminId = vi.fn((id: string) => (id === ADMIN_SLACK ? ('claud' as const) : null))
  const deps = { slack, sendRecap, getAdminId } as unknown as RecapInteractionDeps
  return { deps, slack, sendRecap, getAdminId, calls }
}

function blockAction(actionId: string, opts: { user?: string } = {}) {
  return {
    type: 'block_actions',
    trigger_id: 'trig-1',
    user: { id: opts.user ?? ADMIN_SLACK },
    channel: { id: DRAFT_CHANNEL },
    message: {
      ts: DRAFT_TS,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '홍길동 챔피언 recap 초안' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '2026-10-20' }] },
        { type: 'section', text: { type: 'mrkdwn', text: DRAFT_TEXT } },
        { type: 'actions', elements: [] },
      ],
    },
    actions: [{ action_id: actionId, value: 'sess-1' }],
  }
}

function viewSubmission(text: string, opts: { user?: string; meta?: unknown } = {}) {
  return {
    type: 'view_submission',
    user: { id: opts.user ?? ADMIN_SLACK },
    view: {
      callback_id: 'recap_edit_submit',
      private_metadata: JSON.stringify(opts.meta ?? { sessionId: 'sess-1', channel: DRAFT_CHANNEL, ts: DRAFT_TS }),
      state: { values: { recap_text: { value: { type: 'plain_text_input', value: text } } } },
    },
  }
}

describe('unescapeSlack', () => {
  it('reverses escapeSlack, &amp; last', () => {
    expect(unescapeSlack('A&amp;B &lt;!channel&gt;')).toBe('A&B <!channel>')
    expect(unescapeSlack('&amp;lt;')).toBe('&lt;')
  })
  it('round-trips adversarial strings', () => {
    for (const s of ['&amp;lt;', '&lt;&gt;&amp;', '<@U1> & <!here>', '&&&<<>>', '&amp;amp;gt;', '']) {
      expect(unescapeSlack(escapeSlack(s))).toBe(s)
    }
  })
})

describe('resolveSignedBy', () => {
  const NOW_SEC = 1_800_000_000
  const now = NOW_SEC * 1000
  const body = 'payload=%7B%7D'
  const ts = String(NOW_SEC)
  const sign = (s: string) => `v0=${createHmac('sha256', s).update(`v0:${ts}:${body}`).digest('hex')}`

  it('identifies the booking app', () => {
    expect(resolveSignedBy({ body, timestamp: ts, signature: sign('bk'), now }, { booking: 'bk', recap: 'rc' })).toBe('booking')
  })
  it('identifies the recap app', () => {
    expect(resolveSignedBy({ body, timestamp: ts, signature: sign('rc'), now }, { booking: 'bk', recap: 'rc' })).toBe('recap')
  })
  it('returns null when neither secret matches', () => {
    expect(resolveSignedBy({ body, timestamp: ts, signature: sign('x'), now }, { booking: 'bk', recap: 'rc' })).toBeNull()
  })
  it('is fail-closed for an empty/undefined secret', () => {
    expect(resolveSignedBy({ body, timestamp: ts, signature: sign(''), now }, { booking: '', recap: undefined })).toBeNull()
    expect(resolveSignedBy({ body, timestamp: ts, signature: sign('rc'), now }, { booking: 'rc' })).toBe('booking')
    expect(resolveSignedBy({ body, timestamp: ts, signature: sign('rc'), now }, { recap: 'rc' })).toBe('recap')
  })
  it('returns both when the secrets are equal', () => {
    expect(resolveSignedBy({ body, timestamp: ts, signature: sign('same'), now }, { booking: 'same', recap: 'same' })).toBe('both')
  })
  it('rejects a stale timestamp', () => {
    expect(
      resolveSignedBy({ body, timestamp: ts, signature: sign('rc'), now: now + 301_000 }, { booking: 'bk', recap: 'rc' }),
    ).toBeNull()
  })
})

describe('parseInteractionPayload', () => {
  it('parses a valid payload', () => {
    const body = new URLSearchParams({ payload: JSON.stringify({ type: 'block_actions' }) }).toString()
    expect(parseInteractionPayload(body)).toEqual({ type: 'block_actions' })
  })
  it('returns null for missing, invalid or non-object payloads', () => {
    expect(parseInteractionPayload('')).toBeNull()
    expect(parseInteractionPayload('payload=%7Bnot-json')).toBeNull()
    expect(parseInteractionPayload('payload=null')).toBeNull()
    expect(parseInteractionPayload('payload=42')).toBeNull()
  })
})

describe('dispatchInteraction', () => {
  it('route still dispatches confirm_1on1 and cancel_1on1 unchanged', () => {
    expect(dispatchInteraction(blockAction('confirm_1on1'), 'booking')).toBe('booking_confirm')
    expect(dispatchInteraction(blockAction('cancel_1on1'), 'booking')).toBe('booking_cancel')
    // Original code did not check payload.type for booking actions.
    expect(dispatchInteraction({ actions: [{ action_id: 'confirm_1on1' }] }, 'booking')).toBe('booking_confirm')
  })
  it('routes recap actions and the recap modal to the recap handler', () => {
    expect(dispatchInteraction(blockAction('recap_send'), 'recap')).toBe('recap')
    expect(dispatchInteraction(blockAction('recap_edit'), 'recap')).toBe('recap')
    expect(dispatchInteraction(viewSubmission('x'), 'recap')).toBe('recap')
  })
  it('ignores a recap action signed by the booking secret', () => {
    expect(dispatchInteraction(blockAction('recap_send'), 'booking')).toBe('ignore')
    expect(dispatchInteraction(blockAction('recap_edit'), 'booking')).toBe('ignore')
    expect(dispatchInteraction(viewSubmission('x'), 'booking')).toBe('ignore')
  })
  it('ignores a booking action signed by the recap secret (recap never reaches booking handlers)', () => {
    expect(dispatchInteraction(blockAction('confirm_1on1'), 'recap')).toBe('ignore')
    expect(dispatchInteraction(blockAction('cancel_1on1'), 'recap')).toBe('ignore')
  })
  it('decides by action ownership when both secrets are equal', () => {
    expect(dispatchInteraction(blockAction('confirm_1on1'), 'both')).toBe('booking_confirm')
    expect(dispatchInteraction(blockAction('cancel_1on1'), 'both')).toBe('booking_cancel')
    expect(dispatchInteraction(blockAction('recap_send'), 'both')).toBe('recap')
    expect(dispatchInteraction(viewSubmission('x'), 'both')).toBe('recap')
  })
  it('ignores unknown types, action ids and callback ids', () => {
    expect(dispatchInteraction(blockAction('something_else'), 'recap')).toBe('ignore')
    expect(dispatchInteraction({ type: 'view_submission', view: { callback_id: 'other' } }, 'recap')).toBe('ignore')
    expect(dispatchInteraction({ type: 'shortcut' }, 'both')).toBe('ignore')
    expect(dispatchInteraction({ type: 'view_submission' }, 'both')).toBe('ignore')
    // recap action ids only count inside block_actions
    expect(dispatchInteraction({ type: 'message_action', actions: [{ action_id: 'recap_send' }] }, 'recap')).toBe('ignore')
  })
})

describe('handleRecapAction: recap_send', () => {
  it('non-admin click sends nothing and posts an ephemeral notice', async () => {
    const { deps, slack, sendRecap } = makeDeps()
    const res = await handleRecapAction(deps, blockAction('recap_send', { user: 'UNOBODY' }))
    expect(res).toEqual({})
    expect(sendRecap).not.toHaveBeenCalled()
    expect(slack.chat.update).not.toHaveBeenCalled()
    expect(slack.chat.postMessage).not.toHaveBeenCalled()
    expect(slack.chat.postEphemeral).toHaveBeenCalledWith({
      channel: DRAFT_CHANNEL,
      user: 'UNOBODY',
      text: 'recap 발송은 Admin만 할 수 있어요.',
    })
  })

  it('recap_send success updates the draft message to the sent state', async () => {
    const { deps, slack, sendRecap } = makeDeps()
    await handleRecapAction(deps, blockAction('recap_send'))
    expect(sendRecap).toHaveBeenCalledWith({ sessionId: 'sess-1', adminId: 'claud', expectedDraftTs: DRAFT_TS })
    expect(slack.chat.update).toHaveBeenCalledTimes(1)
    const arg = (slack.chat.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(arg.channel).toBe(DRAFT_CHANNEL)
    expect(arg.ts).toBe(DRAFT_TS)
    expect(typeof arg.text).toBe('string')
    const blocks = arg.blocks as { type: string; elements: { text: string }[] }[]
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('context')
    expect(blocks[0].elements[0].text).toContain('✅ Claud님이 홍길동 챔피언에게 발송했어요')
    expect(slack.chat.postEphemeral).not.toHaveBeenCalled()
  })

  it('recap_send already_sent posts an ephemeral notice and does not update', async () => {
    const { deps, slack } = makeDeps({ ok: false, reason: 'already_sent' })
    await handleRecapAction(deps, blockAction('recap_send'))
    expect(slack.chat.update).not.toHaveBeenCalled()
    expect(slack.chat.postEphemeral).toHaveBeenCalledWith({ channel: DRAFT_CHANNEL, user: ADMIN_SLACK, text: '이미 발송됐어요.' })
  })

  it('recap_send stale_draft posts an ephemeral notice and does not update', async () => {
    const { deps, slack } = makeDeps({ ok: false, reason: 'stale_draft' })
    await handleRecapAction(deps, blockAction('recap_send'))
    expect(slack.chat.update).not.toHaveBeenCalled()
    expect(slack.chat.postMessage).not.toHaveBeenCalled()
    expect(slack.chat.postEphemeral).toHaveBeenCalledWith({
      channel: DRAFT_CHANNEL,
      user: ADMIN_SLACK,
      text: '이미 새 초안으로 대체됐어요. 최신 초안에서 발송해 주세요.',
    })
  })

  it('recap_send not_done / not_found posts an ephemeral notice', async () => {
    for (const reason of ['not_done', 'not_found'] as const) {
      const { deps, slack } = makeDeps({ ok: false, reason })
      await handleRecapAction(deps, blockAction('recap_send'))
      expect(slack.chat.update).not.toHaveBeenCalled()
      expect(slack.chat.postEphemeral).toHaveBeenCalledWith({
        channel: DRAFT_CHANNEL,
        user: ADMIN_SLACK,
        text: '이 세션은 지금 발송할 수 없어요.',
      })
    }
  })

  it('recap_send no_slack_user replies in the draft thread', async () => {
    const { deps, slack } = makeDeps({ ok: false, reason: 'no_slack_user' })
    await handleRecapAction(deps, blockAction('recap_send'))
    expect(slack.chat.update).not.toHaveBeenCalled()
    expect(slack.chat.postMessage).toHaveBeenCalledWith({
      channel: DRAFT_CHANNEL,
      thread_ts: DRAFT_TS,
      text: '챔피언의 Slack 계정을 이메일로 찾지 못했어요.',
    })
  })

  it('recap_send dm_failed replies in the draft thread', async () => {
    const { deps, slack } = makeDeps({ ok: false, reason: 'dm_failed' })
    await handleRecapAction(deps, blockAction('recap_send'))
    expect(slack.chat.postMessage).toHaveBeenCalledWith({
      channel: DRAFT_CHANNEL,
      thread_ts: DRAFT_TS,
      text: '챔피언에게 DM을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
    })
  })

  it('a failing Slack UI call never throws', async () => {
    const { deps, slack } = makeDeps()
    slack.chat.update.mockRejectedValueOnce(new Error('slack down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(handleRecapAction(deps, blockAction('recap_send'))).resolves.toEqual({})
    err.mockRestore()
  })
})

describe('handleRecapAction: recap_edit', () => {
  it('recap_edit opens a modal prefilled with the recap text and carries sessionId in private_metadata', async () => {
    const { deps, slack, sendRecap, calls } = makeDeps()
    await handleRecapAction(deps, blockAction('recap_edit'))
    expect(calls[0]).toBe('views.open')
    expect(sendRecap).not.toHaveBeenCalled()
    expect(slack.views.open).toHaveBeenCalledTimes(1)
    const arg = (slack.views.open.mock.calls[0] as unknown[])[0] as {
      trigger_id: string
      view: Record<string, unknown>
    }
    expect(arg.trigger_id).toBe('trig-1')
    const view = arg.view as {
      type: string
      callback_id: string
      private_metadata: string
      title: { text: string }
      submit: { text: string }
      blocks: { type: string; block_id: string; element: Record<string, unknown> }[]
    }
    expect(view.type).toBe('modal')
    expect(view.callback_id).toBe('recap_edit_submit')
    expect(JSON.parse(view.private_metadata)).toEqual({ sessionId: 'sess-1', channel: DRAFT_CHANNEL, ts: DRAFT_TS })
    expect(view.blocks).toHaveLength(1)
    expect(view.blocks[0].type).toBe('input')
    expect(view.blocks[0].block_id).toBe('recap_text')
    expect(view.blocks[0].element.type).toBe('plain_text_input')
    expect(view.blocks[0].element.action_id).toBe('value')
    expect(view.blocks[0].element.multiline).toBe(true)
    // Human-readable (unescaped) prefill
    expect(view.blocks[0].element.initial_value).toBe('안녕하세요, A&B 챔피언님!\n\n*요약*\n• 1 < 2 && 3 > 2')
    expect((view.blocks[0].element.initial_value as string).length).toBeLessThanOrEqual(3000)
    expect(view.title.text.length).toBeLessThanOrEqual(24)
    expect(view.submit.text).toBe('발송하기')
  })

  it('recap_edit by a non-admin opens nothing and posts an ephemeral notice', async () => {
    const { deps, slack } = makeDeps()
    await handleRecapAction(deps, blockAction('recap_edit', { user: 'UNOBODY' }))
    expect(slack.views.open).not.toHaveBeenCalled()
    expect(slack.chat.postEphemeral).toHaveBeenCalledWith({
      channel: DRAFT_CHANNEL,
      user: 'UNOBODY',
      text: 'recap 발송은 Admin만 할 수 있어요.',
    })
  })
})

describe('handleRecapAction: recap_edit_submit', () => {
  it('recap_edit_submit sends the edited text as override and updates the draft by stored channel and ts', async () => {
    const { deps, slack, sendRecap } = makeDeps()
    const res = await handleRecapAction(deps, viewSubmission('고친 문구예요'))
    expect(sendRecap).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      adminId: 'claud',
      textOverride: '고친 문구예요',
      expectedDraftTs: DRAFT_TS,
    })
    expect(res).toEqual({ response_action: 'clear' })
    expect(slack.chat.update).toHaveBeenCalledTimes(1)
    const arg = (slack.chat.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(arg.channel).toBe(DRAFT_CHANNEL)
    expect(arg.ts).toBe(DRAFT_TS)
    expect(JSON.stringify(arg.blocks)).toContain('Claud님이 홍길동 챔피언에게 발송했어요')
  })

  it('passes admin-typed <!channel> through unmodified (escaped once by sendRecap)', async () => {
    const { deps, sendRecap } = makeDeps()
    await handleRecapAction(deps, viewSubmission('<!channel> A&B'))
    expect(sendRecap).toHaveBeenCalledWith(expect.objectContaining({ textOverride: '<!channel> A&B' }))
  })

  it('recap_edit_submit with empty text returns response_action errors and sends nothing', async () => {
    const { deps, slack, sendRecap } = makeDeps()
    const res = await handleRecapAction(deps, viewSubmission('   \n '))
    expect(res).toEqual({ response_action: 'errors', errors: { recap_text: '보낼 내용을 입력해 주세요.' } })
    expect(sendRecap).not.toHaveBeenCalled()
    expect(slack.chat.update).not.toHaveBeenCalled()
  })

  it('non-admin submit closes without sending', async () => {
    const { deps, slack, sendRecap } = makeDeps()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleRecapAction(deps, viewSubmission('x', { user: 'UNOBODY' }))
    err.mockRestore()
    expect(res).toEqual({ response_action: 'clear' })
    expect(sendRecap).not.toHaveBeenCalled()
    expect(slack.chat.update).not.toHaveBeenCalled()
    expect(slack.chat.postMessage).not.toHaveBeenCalled()
  })

  it('already_sent closes the modal and updates nothing', async () => {
    const { deps, slack } = makeDeps({ ok: false, reason: 'already_sent' })
    const res = await handleRecapAction(deps, viewSubmission('x'))
    expect(res).toEqual({ response_action: 'clear' })
    expect(slack.chat.update).not.toHaveBeenCalled()
    expect(slack.chat.postMessage).not.toHaveBeenCalled()
  })

  it('failure reasons are shown as modal errors', async () => {
    const cases = [
      ['stale_draft', '이미 새 초안으로 대체됐어요. 최신 초안에서 발송해 주세요.'],
      ['no_slack_user', '챔피언의 Slack 계정을 이메일로 찾지 못했어요.'],
      ['dm_failed', '챔피언에게 DM을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'],
      ['not_done', '이 세션은 지금 발송할 수 없어요.'],
      ['not_found', '이 세션은 지금 발송할 수 없어요.'],
    ] as const
    for (const [reason, message] of cases) {
      const { deps, slack } = makeDeps({ ok: false, reason })
      const res = await handleRecapAction(deps, viewSubmission('x'))
      expect(res).toEqual({ response_action: 'errors', errors: { recap_text: message } })
      expect(slack.chat.update).not.toHaveBeenCalled()
    }
  })

  it('invalid private_metadata returns a modal error and sends nothing', async () => {
    const { deps, sendRecap } = makeDeps()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await handleRecapAction(deps, viewSubmission('x', { meta: 'nope' }))
    err.mockRestore()
    expect(res).toEqual({ response_action: 'errors', errors: { recap_text: '이 세션은 지금 발송할 수 없어요.' } })
    expect(sendRecap).not.toHaveBeenCalled()
  })
})
