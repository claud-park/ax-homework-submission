import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { postRecapDraft } from '@/lib/recap/postDraft'

type Row = Record<string, unknown>

function makeSupabase(opts: { session?: Row | null; user?: Row; items?: Row[]; updateError?: boolean; log?: string[] }) {
  const updates: Row[] = []
  const session =
    opts.session === undefined
      ? {
          id: 's1',
          champion_user_id: 'u1',
          title: '주간 1:1',
          session_date: '2026-10-20',
          notes: '메모\n\n---\n\n**🤖 AI 요약**\n\n## 결정\n- 진행해요',
          processing_status: 'done',
          recap_sent_at: null,
        }
      : opts.session
  const user = opts.user ?? { name: '홍길동', email: 'a@b.c' }
  const items = opts.items ?? [{ body: '할 일', is_completed: false, display_order: 0 }]
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.order = () => Promise.resolve({ data: items, error: null })
      q.single = () =>
        Promise.resolve({ data: table === 'users' ? user : session, error: session || table === 'users' ? null : { message: 'x' } })
      q.maybeSingle = q.single
      q.update = (patch: Row) => {
        updates.push({ table, ...patch })
        opts.log?.push('update')
        return { eq: () => Promise.resolve({ error: opts.updateError ? { message: 'db down' } : null }) }
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, updates }
}

const env = { channelId: 'C_CFG', token: 'xoxb-test', baseUrl: 'https://app.test' }

describe('postRecapDraft', () => {
  it('posts a draft with send and edit buttons and stores channel and ts', async () => {
    const { client, updates } = makeSupabase({})
    const postMessage = vi.fn().mockResolvedValue({ ok: true, channel: 'C_RES', ts: '1.23' })
    await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(postMessage).toHaveBeenCalledTimes(1)
    const arg = postMessage.mock.calls[0][0]
    expect(arg.channel).toBe('C_CFG')
    const actions = arg.blocks.find((b: { type: string }) => b.type === 'actions')
    expect(actions.elements.map((e: { action_id: string }) => e.action_id)).toEqual(['recap_send', 'recap_edit'])
    expect(JSON.stringify(arg.blocks)).toContain('https://app.test/my-project/sessions/s1')
    expect(updates).toContainEqual(expect.objectContaining({ recap_slack_channel: 'C_RES', recap_slack_ts: '1.23' }))
  })

  it('does nothing when RECAP_SLACK_CHANNEL_ID or token is missing', async () => {
    const { client } = makeSupabase({})
    const postMessage = vi.fn()
    const slackClient = { chat: { postMessage } } as never
    await postRecapDraft({ supabase: client, slackClient, env: { ...env, channelId: undefined } }, 's1')
    await postRecapDraft({ supabase: client, slackClient, env: { ...env, token: undefined } }, 's1')
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('trims padded channel id and token, and treats blank ones as unset', async () => {
    const { client } = makeSupabase({})
    const postMessage = vi.fn().mockResolvedValue({ ok: true, channel: 'C1', ts: '1.0' })
    const slackClient = { chat: { postMessage } } as never
    await postRecapDraft({ supabase: client, slackClient, env: { ...env, channelId: ' C_CFG\n' } }, 's1')
    expect(postMessage.mock.calls[0][0].channel).toBe('C_CFG')
    postMessage.mockClear()
    await postRecapDraft({ supabase: client, slackClient, env: { ...env, token: '  ' } }, 's1')
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('does nothing when the session is not done', async () => {
    const { client } = makeSupabase({
      session: { id: 's1', champion_user_id: 'u1', processing_status: 'low_quality', recap_sent_at: null },
    })
    const postMessage = vi.fn()
    await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('resets recap_sent_at/by and marks previouslySent when the session was sent before', async () => {
    const log: string[] = []
    const { client, updates } = makeSupabase({
      log,
      session: {
        id: 's1',
        champion_user_id: 'u1',
        title: null,
        session_date: '2026-10-20',
        notes: '요약',
        processing_status: 'done',
        recap_sent_at: '2026-10-20T00:00:00Z',
      },
    })
    const postMessage = vi.fn().mockImplementation(async () => {
      log.push('post')
      return { ok: true, channel: 'C1', ts: '2.0' }
    })
    await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(log).toEqual(['post', 'update', 'update'])
    expect(updates).toHaveLength(2)
    expect(updates[1]).toEqual({ table: 'check_up_sessions', recap_draft_error: null })
    expect(updates[0]).toMatchObject({
      recap_slack_channel: 'C1',
      recap_slack_ts: '2.0',
      recap_sent_at: null,
      recap_sent_by: null,
    })
    expect(JSON.stringify(postMessage.mock.calls[0][0].blocks)).toContain('이전 recap이 이미 발송됐어요')
  })

  const sentSession = {
    id: 's1',
    champion_user_id: 'u1',
    title: null,
    session_date: '2026-10-20',
    notes: '요약',
    processing_status: 'done',
    recap_sent_at: '2026-10-20T00:00:00Z',
  }

  it('keeps recap_sent_at and recap_sent_by when the Slack post fails', async () => {
    const { client, updates } = makeSupabase({ session: sentSession })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const postMessage = vi.fn().mockRejectedValue(new Error('boom'))
    await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(updates).toEqual([{ table: 'check_up_sessions', recap_draft_error: 'unknown' }])
    expect(updates.some((u) => 'recap_sent_at' in u || 'recap_sent_by' in u)).toBe(false)
    spy.mockRestore()
  })

  it('keeps recap_sent_at when the ts write fails', async () => {
    const { client, updates } = makeSupabase({ session: sentSession, updateError: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const postMessage = vi.fn().mockResolvedValue({ ok: true, channel: 'C1', ts: '3.0' })
    await expect(
      postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1'),
    ).resolves.toEqual({ posted: false, reason: 'db_error' })
    // The state update was attempted but failed (DB leaves the row untouched); it was logged.
    expect(updates[0]).toMatchObject({ recap_slack_ts: '3.0' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('swallows a Slack error without throwing', async () => {
    const { client, updates } = makeSupabase({})
    const postMessage = vi.fn().mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1'),
    ).resolves.toMatchObject({ posted: false, reason: 'slack_error', errorCode: 'unknown' })
    expect(updates.some((u) => typeof u.recap_slack_ts === 'string')).toBe(false)
    spy.mockRestore()
  })

  it('returns posted:true and clears recap_draft_error in a separate update after success', async () => {
    const { client, updates } = makeSupabase({})
    const postMessage = vi.fn().mockResolvedValue({ ok: true, channel: 'C1', ts: '1.0' })
    const r = await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(r).toEqual({ posted: true })
    expect(updates).toHaveLength(2)
    expect(updates[0]).toHaveProperty('recap_slack_ts', '1.0')
    expect(updates[0]).not.toHaveProperty('recap_draft_error')
    expect(updates[1]).toEqual({ table: 'check_up_sessions', recap_draft_error: null })
  })

  it('classifies a Slack channel_not_found and records only recap_draft_error', async () => {
    const { client, updates } = makeSupabase({ session: { ...sentSession } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = Object.assign(new Error('An API error occurred: channel_not_found'), {
      code: 'slack_webapi_platform_error',
      data: { ok: false, error: 'channel_not_found' },
    })
    const postMessage = vi.fn().mockRejectedValue(err)
    const r = await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(r).toEqual({ posted: false, reason: 'slack_error', errorCode: 'channel_not_found' })
    expect(updates).toEqual([{ table: 'check_up_sessions', recap_draft_error: 'channel_not_found' }])
    spy.mockRestore()
  })

  it('does not write anything and reports not_configured when config is missing', async () => {
    const { client, updates } = makeSupabase({})
    const postMessage = vi.fn()
    const slackClient = { chat: { postMessage } } as never
    expect(await postRecapDraft({ supabase: client, slackClient, env: { ...env, channelId: undefined } }, 's1')).toEqual({
      posted: false,
      reason: 'not_configured',
    })
    expect(await postRecapDraft({ supabase: client, slackClient, env: { ...env, token: undefined } }, 's1')).toEqual({
      posted: false,
      reason: 'not_configured',
    })
    expect(updates).toEqual([])
  })

  it('reports not_found and not_done without writing', async () => {
    const postMessage = vi.fn()
    const slackClient = { chat: { postMessage } } as never
    const a = makeSupabase({ session: null })
    expect(await postRecapDraft({ supabase: a.client, slackClient, env }, 's1')).toEqual({ posted: false, reason: 'not_found' })
    const b = makeSupabase({ session: { id: 's1', champion_user_id: 'u1', processing_status: 'error', recap_sent_at: null } })
    expect(await postRecapDraft({ supabase: b.client, slackClient, env }, 's1')).toEqual({ posted: false, reason: 'not_done' })
    expect(a.updates).toEqual([])
    expect(b.updates).toEqual([])
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('refuseIfSent refuses an already-sent session without posting', async () => {
    const { client, updates } = makeSupabase({ session: sentSession })
    const postMessage = vi.fn()
    const r = await postRecapDraft(
      { supabase: client, slackClient: { chat: { postMessage } } as never, env, refuseIfSent: true },
      's1',
    )
    expect(r).toEqual({ posted: false, reason: 'already_sent' })
    expect(postMessage).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('refuseIfSent still posts when not yet sent', async () => {
    const { client } = makeSupabase({})
    const postMessage = vi.fn().mockResolvedValue({ ok: true, channel: 'C1', ts: '1.0' })
    const r = await postRecapDraft(
      { supabase: client, slackClient: { chat: { postMessage } } as never, env, refuseIfSent: true },
      's1',
    )
    expect(r).toEqual({ posted: true })
  })

  it('automatic path re-posts a sent session with the previouslySent banner', async () => {
    const { client } = makeSupabase({ session: sentSession })
    const postMessage = vi.fn().mockResolvedValue({ ok: true, channel: 'C1', ts: '1.0' })
    const r = await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(r).toEqual({ posted: true })
    expect(JSON.stringify(postMessage.mock.calls[0][0].blocks)).toContain('이전 recap이 이미 발송됐어요')
  })

  it('does not throw and keeps the result when the error-code update fails (missing column)', async () => {
    const { client, updates } = makeSupabase({ updateError: true })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = Object.assign(new Error('x'), { code: 'slack_webapi_platform_error', data: { error: 'not_in_channel' } })
    const postMessage = vi.fn().mockRejectedValue(err)
    const r = await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(r).toEqual({ posted: false, reason: 'slack_error', errorCode: 'not_in_channel' })
    expect(updates).toEqual([{ table: 'check_up_sessions', recap_draft_error: 'not_in_channel' }])
    spy.mockRestore()
  })

  it('does not clear the error when the post succeeded but ts is missing', async () => {
    const { client, updates } = makeSupabase({})
    const postMessage = vi.fn().mockResolvedValue({ ok: true })
    const r = await postRecapDraft({ supabase: client, slackClient: { chat: { postMessage } } as never, env }, 's1')
    expect(r).toEqual({ posted: false, reason: 'slack_error', errorCode: 'unknown' })
    expect(updates).toEqual([{ table: 'check_up_sessions', recap_draft_error: 'unknown' }])
  })
})
