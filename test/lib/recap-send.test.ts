import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRecapToChampion } from '@/lib/recap/sendRecap'

type Row = Record<string, unknown>

// Stub that really simulates check_up_sessions.recap_sent_at / recap_sent_by state.
function makeSupabase(
  opts: {
    session?: Row | null
    claimError?: boolean
    sessionReadError?: boolean
    itemsError?: boolean
    /** users.recap_slack_channel_id 값. 'missing'이면 컬럼 없음(마이그레이션 전) 오류. */
    recapChannel?: string | null | 'missing'
    email?: string | null
  } = {},
) {
  const session: Row | null =
    opts.session === undefined
      ? {
          id: 's1',
          champion_user_id: 'u1',
          title: '주간 1:1',
          session_date: '2026-10-20',
          notes: '메모\n\n---\n\n**🤖 AI 요약**\n\n## 결정\n- 진행해요',
          processing_status: 'done',
          recap_slack_ts: '1.23',
          recap_sent_at: null,
          recap_sent_by: null,
        }
      : opts.session
  const user = { name: '홍길동', email: opts.email === undefined ? 'champ@test.io' : opts.email }
  const items = [{ body: '할 일', is_completed: false, display_order: 0 }]
  const writes: Row[] = []

  const client = {
    from(table: string) {
      const filters: [string, unknown, 'eq' | 'is'][] = []
      let patch: Row | null = null
      const matches = () =>
        !!session && filters.every(([k, v]) => (session as Row)[k] === v || (v === null && (session as Row)[k] == null))
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (k: string, v: unknown) => (filters.push([k, v, 'eq']), q)
      q.is = (k: string, v: unknown) => (filters.push([k, v, 'is']), q)
      q.order = () =>
        Promise.resolve(opts.itemsError ? { data: null, error: { message: 'items down' } } : { data: items, error: null })
      q.maybeSingle = () =>
        Promise.resolve(
          table === 'users'
            ? opts.recapChannel === 'missing'
              ? { data: null, error: { code: '42703', message: 'column users.recap_slack_channel_id does not exist' } }
              : { data: { recap_slack_channel_id: opts.recapChannel ?? null }, error: null }
            : { data: null, error: null },
        )
      q.single = () =>
        Promise.resolve(
          table === 'users'
            ? { data: user, error: null }
            : opts.sessionReadError
              ? { data: null, error: { message: 'db down', code: '500' } }
              : { data: session, error: session ? null : { message: 'nf', code: 'PGRST116' } },
        )
      q.update = (p: Row) => ((patch = p), q)
      // awaiting the update chain (with or without .select)
      q.then = (resolve: (v: unknown) => void) => {
        if (!patch) return resolve({ data: null, error: null })
        if (opts.claimError && patch.recap_sent_at) return resolve({ data: null, error: { message: 'db down' } })
        const hit = matches()
        if (hit && session) {
          Object.assign(session, patch)
          writes.push({ ...patch })
        }
        resolve({ data: hit ? [{ id: 's1' }] : [], error: null })
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, session, writes }
}

function makeSlack(
  opts: {
    lookup?: 'ok' | 'notfound' | 'throw' | 'nouser'
    post?: 'ok' | 'fail'
    open?: 'ok' | 'fail' | 'none'
    /** 채널(C…/G… 9자 이상) 대상 postMessage만 실패시킨다. */
    channelPost?: 'not_in_channel' | 'network'
  } = {},
) {
  const lookupByEmail = vi.fn(async (_a: { email: string }) => {
    if (opts.lookup === 'notfound') throw Object.assign(new Error('users_not_found'), { data: { error: 'users_not_found' } })
    if (opts.lookup === 'nouser') return { ok: true }
    if (opts.lookup === 'throw') throw new Error('network')
    return { ok: true, user: { id: 'U_CHAMP' } }
  })
  const postMessage = vi.fn(async (a: { channel: string; text: string; unfurl_links?: boolean; unfurl_media?: boolean }) => {
    if (opts.channelPost && a.channel.startsWith('C0')) {
      if (opts.channelPost === 'network') throw Object.assign(new Error('timeout'), { code: 'slack_webapi_request_error' })
      throw Object.assign(new Error('not_in_channel'), { code: 'slack_webapi_platform_error', data: { error: 'not_in_channel' } })
    }
    if (opts.post === 'fail') throw new Error('channel_not_found')
    return { ok: true }
  })
  const open = vi.fn(async (_a: { users: string }) => {
    if (opts.open === 'fail') throw Object.assign(new Error('missing_scope'), { data: { error: 'missing_scope' } })
    return { ok: true, channel: { id: 'G_GROUP' } }
  })
  const slack: { chat: { postMessage: (a: { channel: string; text: string }) => Promise<unknown> }; users: unknown; conversations?: unknown } = {
    chat: { postMessage },
    users: { lookupByEmail },
    ...(opts.open === undefined || opts.open === 'none' ? {} : { conversations: { open } }),
  }
  return { slack: slack as never, chat: slack.chat, postMessage, lookupByEmail, open }
}

const baseUrl = 'https://app.test'

describe('sendRecapToChampion', () => {
  it('sends once and marks recap_sent_at and recap_sent_by', async () => {
    const { client, session } = makeSupabase()
    const { slack, postMessage, lookupByEmail } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'admin1' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.championName).toBe('홍길동')
      expect(res.sentAt).toBeInstanceOf(Date)
    }
    expect(lookupByEmail).toHaveBeenCalledWith({ email: 'champ@test.io' })
    expect(postMessage).toHaveBeenCalledTimes(1)
    const arg = postMessage.mock.calls[0][0]
    expect(arg.channel).toBe('U_CHAMP')
    expect(arg.text).toContain('https://app.test/my-project/sessions/s1')
    expect(session?.recap_sent_at).toBeTruthy()
    expect(session?.recap_sent_by).toBe('admin1')
  })

  it('second concurrent call returns already_sent and posts no second DM', async () => {
    const { client } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    const deps = { supabase: client, slackClient: slack, baseUrl }
    const results = await Promise.all([
      sendRecapToChampion(deps, { sessionId: 's1', adminId: 'a1' }),
      sendRecapToChampion(deps, { sessionId: 's1', adminId: 'a2' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.reason === 'already_sent')).toHaveLength(1)
    expect(postMessage).toHaveBeenCalledTimes(1)
  })

  it('rolls back the claim when the champion has no Slack user', async () => {
    const { client, session } = makeSupabase()
    const deps = { supabase: client, baseUrl }
    const bad = makeSlack({ lookup: 'notfound' })
    const r1 = await sendRecapToChampion({ ...deps, slackClient: bad.slack }, { sessionId: 's1', adminId: 'a1' })
    expect(r1).toEqual({ ok: false, reason: 'no_slack_user' })
    expect(bad.postMessage).not.toHaveBeenCalled()
    expect(session?.recap_sent_at).toBeNull()
    expect(session?.recap_sent_by).toBeNull()
    const good = makeSlack()
    const r2 = await sendRecapToChampion({ ...deps, slackClient: good.slack }, { sessionId: 's1', adminId: 'a1' })
    expect(r2.ok).toBe(true)
  })

  it('rolls back the claim when chat.postMessage fails', async () => {
    const { client, session } = makeSupabase()
    const { slack } = makeSlack({ post: 'fail' })
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res).toEqual({ ok: false, reason: 'dm_failed' })
    expect(session?.recap_sent_at).toBeNull()
    expect(session?.recap_sent_by).toBeNull()
  })

  it('does not roll back a claim that now belongs to someone else', async () => {
    const { client, session } = makeSupabase()
    const { slack } = makeSlack({ post: 'fail' })
    // Simulate another admin re-claiming between our claim and rollback: change owner on DM failure.
    ;(slack as { chat: { postMessage: unknown } }).chat.postMessage = vi.fn(async () => {
      Object.assign(session as Row, { recap_sent_by: 'other', recap_sent_at: 'later' })
      throw new Error('boom')
    })
    await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(session?.recap_sent_by).toBe('other')
  })

  it('returns dm_failed without proceeding when the claim update errors', async () => {
    const { client } = makeSupabase({ claimError: true })
    const { slack, postMessage, lookupByEmail } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res).toEqual({ ok: false, reason: 'dm_failed' })
    expect(lookupByEmail).not.toHaveBeenCalled()
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('sends for a manually uploaded note (idle + notes)', async () => {
    const { client } = makeSupabase({ session: { id: 's1', champion_user_id: 'u1', title: 't', session_date: '2026-10-20', notes: '직접 올린 노트', processing_status: 'idle', recap_sent_at: null, recap_slack_ts: null } })
    const { slack, postMessage } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res.ok).toBe(true)
    expect(postMessage).toHaveBeenCalledTimes(1)
  })

  it('refuses a session that is not done', async () => {
    const { client, writes } = makeSupabase({ session: { id: 's1', champion_user_id: 'u1', processing_status: 'processing', recap_sent_at: null } })
    const { slack, postMessage } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res).toEqual({ ok: false, reason: 'not_done' })
    expect(writes).toHaveLength(0)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('returns not_found for a missing session', async () => {
    const { client } = makeSupabase({ session: null })
    const { slack } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 'zz', adminId: 'a1' })
    expect(res).toEqual({ ok: false, reason: 'not_found' })
  })

  it('refuses a stale draft before claiming, and skips the check when expectedDraftTs is undefined', async () => {
    const { client, writes } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    const deps = { supabase: client, slackClient: slack, baseUrl }
    const stale = await sendRecapToChampion(deps, { sessionId: 's1', adminId: 'a1', expectedDraftTs: '0.99' })
    expect(stale).toEqual({ ok: false, reason: 'stale_draft' })
    expect(writes).toHaveLength(0)
    expect(postMessage).not.toHaveBeenCalled()
    const fresh = await sendRecapToChampion(deps, { sessionId: 's1', adminId: 'a1', expectedDraftTs: '1.23' })
    expect(fresh.ok).toBe(true)
  })

  it('escapes textOverride so it cannot trigger mentions, and appends the note link', async () => {
    const { client } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    await sendRecapToChampion(
      { supabase: client, slackClient: slack, baseUrl },
      { sessionId: 's1', adminId: 'a1', textOverride: '안녕하세요 <!channel> <@U123> <http://evil|click> & 끝' },
    )
    const text = postMessage.mock.calls[0][0].text
    expect(text).toContain('&lt;!channel&gt;')
    expect(text).toContain('&lt;@U123&gt;')
    expect(text).toContain('&amp; 끝')
    expect(text).not.toMatch(/<!channel>|<@U123>|<http/)
    expect(text).toContain('노트 전체는 여기에서 볼 수 있어요: https://app.test/my-project/sessions/s1')
  })

  it('does not duplicate the note link when the override already contains it', async () => {
    const { client } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    const url = 'https://app.test/my-project/sessions/s1'
    await sendRecapToChampion(
      { supabase: client, slackClient: slack, baseUrl },
      { sessionId: 's1', adminId: 'a1', textOverride: `내용이에요 ${url}` },
    )
    const text = postMessage.mock.calls[0][0].text
    expect(text.split(url)).toHaveLength(2)
  })

  it('truncates a long textOverride to 2900 chars and keeps the note link', async () => {
    const { client } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    await sendRecapToChampion(
      { supabase: client, slackClient: slack, baseUrl },
      { sessionId: 's1', adminId: 'a1', textOverride: '가'.repeat(5000) },
    )
    const text = postMessage.mock.calls[0][0].text
    expect(text.length).toBeLessThanOrEqual(2900)
    expect(text).toContain('…')
    expect(text.endsWith('https://app.test/my-project/sessions/s1')).toBe(true)
  })

  it('refuses as stale when the stored ts is null and expectedDraftTs is given', async () => {
    const { client, writes } = makeSupabase({
      session: { id: 's1', champion_user_id: 'u1', processing_status: 'done', recap_slack_ts: null, recap_sent_at: null },
    })
    const { slack, postMessage } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1', expectedDraftTs: '1.23' })
    expect(res).toEqual({ ok: false, reason: 'stale_draft' })
    expect(writes).toHaveLength(0)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('treats lookupByEmail resolving without a user as no_slack_user and rolls back', async () => {
    const { client, session } = makeSupabase()
    const { slack, postMessage } = makeSlack({ lookup: 'nouser' })
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res).toEqual({ ok: false, reason: 'no_slack_user' })
    expect(postMessage).not.toHaveBeenCalled()
    expect(session?.recap_sent_at).toBeNull()
  })

  it.each(['', '   \n '])('falls back to the generated recap for an empty override (%j)', async (override) => {
    const { client } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1', textOverride: override })
    const text = postMessage.mock.calls[0][0].text
    expect(text).toContain('홍길동 챔피언님')
    expect(text).toContain('*요약*')
  })

  it('keeps the note link even when the override contains it only in the truncated tail', async () => {
    const { client } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    const url = 'https://app.test/my-project/sessions/s1'
    await sendRecapToChampion(
      { supabase: client, slackClient: slack, baseUrl },
      { sessionId: 's1', adminId: 'a1', textOverride: `${'가'.repeat(5000)} ${url}` },
    )
    const text = postMessage.mock.calls[0][0].text
    expect(text.length).toBeLessThanOrEqual(2900)
    expect(text.endsWith(url)).toBe(true)
    expect(text.split(url)).toHaveLength(2)
  })

  it('returns dm_failed (not not_found) when the session read errors, with no claim or Slack call', async () => {
    const { client, writes } = makeSupabase({ sessionReadError: true })
    const { slack, postMessage, lookupByEmail } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res).toEqual({ ok: false, reason: 'dm_failed' })
    expect(writes).toHaveLength(0)
    expect(lookupByEmail).not.toHaveBeenCalled()
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('returns dm_failed when the action items read errors, with no claim or Slack call', async () => {
    const { client, writes } = makeSupabase({ itemsError: true })
    const { slack, postMessage } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res).toEqual({ ok: false, reason: 'dm_failed' })
    expect(writes).toHaveLength(0)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('rollback leaves the claim alone when only recap_sent_at differs', async () => {
    const { client, session } = makeSupabase()
    const { slack, chat } = makeSlack()
    chat.postMessage = vi.fn(async () => {
      Object.assign(session as Row, { recap_sent_at: 'later' }) // recap_sent_by still our admin
      throw new Error('boom')
    })
    await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(session?.recap_sent_at).toBe('later')
    expect(session?.recap_sent_by).toBe('a1')
  })

  it('rollback leaves the claim alone when only recap_sent_by differs', async () => {
    const { client, session } = makeSupabase()
    const { slack, chat } = makeSlack()
    chat.postMessage = vi.fn(async () => {
      Object.assign(session as Row, { recap_sent_by: 'other' }) // recap_sent_at still ours
      throw new Error('boom')
    })
    await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(session?.recap_sent_by).toBe('other')
    expect(session?.recap_sent_at).toBeTruthy()
  })

  it('logs platform errors by code and request errors as possibly-delivered', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = async (err: unknown) => {
      const { client } = makeSupabase()
      const { slack, chat } = makeSlack()
      chat.postMessage = vi.fn(async () => {
        throw err
      })
      await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    }
    await run(Object.assign(new Error('x'), { code: 'slack_webapi_platform_error', data: { error: 'channel_not_found' } }))
    expect(spy.mock.calls.at(-1)?.[0]).toContain('channel_not_found')
    await run(Object.assign(new Error('x'), { code: 'slack_webapi_request_error' }))
    expect(spy.mock.calls.at(-1)?.[0]).toContain('DM outcome may be unknown (possible delivery) for session s1, claim rolled back')
    spy.mockRestore()
  })

  describe('group DM (claud + jennifer + champion)', () => {
    const adminSlackIds = ['U_CLAUD', 'U_JEN']

    it('opens one group DM with admins + champion and posts there', async () => {
      const { client } = makeSupabase()
      const { slack, postMessage, open } = makeSlack({ open: 'ok' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(open).toHaveBeenCalledTimes(1)
      const users = open.mock.calls[0][0].users.split(',').sort()
      expect(users).toEqual(['U_CHAMP', 'U_CLAUD', 'U_JEN'])
      expect(postMessage.mock.calls[0][0].channel).toBe('G_GROUP')
      expect(res.ok && res.destination).toBe('group')
    })

    it('falls back to the champion 1:1 DM when opening the group fails', async () => {
      const { client } = makeSupabase()
      const { slack, postMessage } = makeSlack({ open: 'fail' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage.mock.calls[0][0].channel).toBe('U_CHAMP')
      expect(res.ok && res.destination).toBe('dm')
    })

    it('uses 1:1 DM when no admin ids are configured', async () => {
      const { client } = makeSupabase()
      const { slack, postMessage, open } = makeSlack({ open: 'ok' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds: [] }, { sessionId: 's1', adminId: 'a1' })
      expect(open).not.toHaveBeenCalled()
      expect(postMessage.mock.calls[0][0].channel).toBe('U_CHAMP')
      expect(res.ok && res.destination).toBe('dm')
    })

    it('rolls back the claim when posting to the group fails', async () => {
      const { client, session } = makeSupabase()
      const { slack } = makeSlack({ open: 'ok', post: 'fail' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(res).toEqual({ ok: false, reason: 'dm_failed' })
      expect(session?.recap_sent_at ?? null).toBeNull()
    })
  })

  describe('recap channel (users.recap_slack_channel_id)', () => {
    const adminSlackIds = ['U_CLAUD', 'U_JEN']
    const CH = 'C0123ABCD'

    it('posts to the saved channel with unfurl off and skips the group DM', async () => {
      const { client, session } = makeSupabase({ recapChannel: CH })
      const { slack, postMessage, open } = makeSlack({ open: 'ok' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(postMessage.mock.calls[0][0]).toMatchObject({ channel: CH, unfurl_links: false, unfurl_media: false })
      expect(open).not.toHaveBeenCalled()
      expect(res).toMatchObject({ ok: true, destination: 'channel', channelId: CH, slackUserId: 'U_CHAMP' })
      expect(session?.recap_sent_at).toBeTruthy()
    })

    it('falls back to the group DM when Slack rejects the channel, logging the error code', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client } = makeSupabase({ recapChannel: CH })
      const { slack, postMessage } = makeSlack({ open: 'ok', channelPost: 'not_in_channel' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage.mock.calls.map((c) => c[0].channel)).toEqual([CH, 'G_GROUP'])
      expect(res.ok && res.destination).toBe('group')
      expect(spy.mock.calls.some((c) => String(c[0]).includes('not_in_channel'))).toBe(true)
      spy.mockRestore()
    })

    it('falls back to the 1:1 DM when both the channel and the group DM fail', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client } = makeSupabase({ recapChannel: CH })
      const { slack, postMessage } = makeSlack({ open: 'fail', channelPost: 'not_in_channel' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage.mock.calls.map((c) => c[0].channel)).toEqual([CH, 'U_CHAMP'])
      expect(res.ok && res.destination).toBe('dm')
      spy.mockRestore()
    })

    it('rolls back the claim when every path fails', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client, session } = makeSupabase({ recapChannel: CH })
      const { slack, postMessage } = makeSlack({ open: 'ok', post: 'fail', channelPost: 'not_in_channel' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage).toHaveBeenCalledTimes(2)
      expect(res).toEqual({ ok: false, reason: 'dm_failed' })
      expect(session?.recap_sent_at ?? null).toBeNull()
      spy.mockRestore()
    })

    it('rolls back with no_slack_user when the channel is rejected and the champion has no Slack user', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client, session } = makeSupabase({ recapChannel: CH })
      const { slack, postMessage } = makeSlack({ lookup: 'notfound', channelPost: 'not_in_channel' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(res).toEqual({ ok: false, reason: 'no_slack_user' })
      expect(session?.recap_sent_at ?? null).toBeNull()
      spy.mockRestore()
    })

    it('does not fall back on a network error (may have been delivered) and rolls back', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client, session } = makeSupabase({ recapChannel: CH })
      const { slack, postMessage } = makeSlack({ open: 'ok', channelPost: 'network' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(res).toEqual({ ok: false, reason: 'dm_failed' })
      expect(session?.recap_sent_at ?? null).toBeNull()
      spy.mockRestore()
    })

    it('still sends to the channel when the champion Slack lookup fails or email is empty', async () => {
      const a = makeSupabase({ recapChannel: CH })
      const s1 = makeSlack({ lookup: 'throw' })
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const r1 = await sendRecapToChampion({ supabase: a.client, slackClient: s1.slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
      expect(r1).toMatchObject({ ok: true, destination: 'channel', slackUserId: null })
      const b = makeSupabase({ recapChannel: CH, email: null })
      const s2 = makeSlack()
      const r2 = await sendRecapToChampion({ supabase: b.client, slackClient: s2.slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
      expect(s2.lookupByEmail).not.toHaveBeenCalled()
      expect(r2).toMatchObject({ ok: true, destination: 'channel' })
      spy.mockRestore()
    })

    it('treats a missing column (migration not applied) as unset and sends as before', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { client } = makeSupabase({ recapChannel: 'missing' })
      const { slack, postMessage } = makeSlack({ open: 'ok' })
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage.mock.calls[0][0].channel).toBe('G_GROUP')
      expect(res.ok && res.destination).toBe('group')
      expect(spy.mock.calls.some((c) => String(c[0]).includes('recap channel read failed'))).toBe(true)
      spy.mockRestore()
    })

    it('ignores a stored value that is not a valid channel id', async () => {
      const { client } = makeSupabase({ recapChannel: 'C1> <!channel' })
      const { slack, postMessage } = makeSlack()
      const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl, adminSlackIds: [] }, { sessionId: 's1', adminId: 'a1' })
      expect(postMessage.mock.calls[0][0].channel).toBe('U_CHAMP')
      expect(res.ok && res.destination).toBe('dm')
    })
  })
})
