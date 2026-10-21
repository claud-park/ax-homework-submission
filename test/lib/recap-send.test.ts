import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendRecapToChampion } from '@/lib/recap/sendRecap'

type Row = Record<string, unknown>

// Stub that really simulates check_up_sessions.recap_sent_at / recap_sent_by state.
function makeSupabase(opts: { session?: Row | null; claimError?: boolean } = {}) {
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
  const user = { name: '홍길동', email: 'champ@test.io' }
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
      q.order = () => Promise.resolve({ data: items, error: null })
      q.single = () =>
        Promise.resolve(
          table === 'users'
            ? { data: user, error: null }
            : { data: session, error: session ? null : { message: 'nf' } },
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

function makeSlack(opts: { lookup?: 'ok' | 'notfound' | 'throw'; post?: 'ok' | 'fail' } = {}) {
  const lookupByEmail = vi.fn(async (_a: { email: string }) => {
    if (opts.lookup === 'notfound') throw Object.assign(new Error('users_not_found'), { data: { error: 'users_not_found' } })
    if (opts.lookup === 'throw') throw new Error('network')
    return { ok: true, user: { id: 'U_CHAMP' } }
  })
  const postMessage = vi.fn(async (_a: { channel: string; text: string }) => {
    if (opts.post === 'fail') throw new Error('channel_not_found')
    return { ok: true }
  })
  return { slack: { chat: { postMessage }, users: { lookupByEmail } } as never, postMessage, lookupByEmail }
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
    expect(arg.text).toContain('https://app.test/admin/champions/u1')
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

  it('sends a matching expectedDraftTs-less call (check skipped)', async () => {
    const { client } = makeSupabase()
    const { slack } = makeSlack()
    const res = await sendRecapToChampion({ supabase: client, slackClient: slack, baseUrl }, { sessionId: 's1', adminId: 'a1' })
    expect(res.ok).toBe(true)
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
    expect(text).toContain('노트 전체는 여기에서 볼 수 있어요: https://app.test/admin/champions/u1')
  })

  it('does not duplicate the note link when the override already contains it', async () => {
    const { client } = makeSupabase()
    const { slack, postMessage } = makeSlack()
    const url = 'https://app.test/admin/champions/u1'
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
    expect(text.endsWith('https://app.test/admin/champions/u1')).toBe(true)
  })
})
