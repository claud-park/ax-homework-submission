import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebClient } from '@slack/web-api'
import { buildRecapText, escapeSlack, truncateForSlack } from './format'
import { recapSlack } from './slackClient'
import { buildNoteUrl, resolveBaseUrl } from './noteUrl'
import { isRecapChannelId } from './channelId'

export interface SendRecapDeps {
  supabase: SupabaseClient
  slackClient?: Pick<WebClient, 'chat' | 'users'> & Partial<Pick<WebClient, 'conversations'>>
  baseUrl?: string
  /** 그룹 DM에 함께 넣을 어드민 Slack user id. 기본은 ADMIN_SLACK_CLAUD + ADMIN_SLACK_JENNIFER. 비면 1:1 DM. */
  adminSlackIds?: string[]
}

function defaultAdminSlackIds(): string[] {
  return [process.env.ADMIN_SLACK_CLAUD, process.env.ADMIN_SLACK_JENNIFER]
    .map((v) => (v ?? '').trim())
    .filter((v) => /^[UW][A-Z0-9]+$/.test(v))
}

export type SendRecapResult =
  | {
      ok: true
      championName: string
      sentAt: Date
      /** 챔피언 Slack user id. 채널로 보냈고 이메일 조회가 실패했으면 null. */
      slackUserId: string | null
      destination: 'channel' | 'group' | 'dm'
      /** destination === 'channel'일 때 보낸 채널 id */
      channelId?: string
    }
  | {
      ok: false
      reason: 'not_found' | 'not_done' | 'already_sent' | 'no_slack_user' | 'dm_failed' | 'stale_draft'
    }

const SLACK_TEXT_MAX = 2900

/**
 * Admin-typed text is untrusted: escape &, <, > (no mentions/links), cap the length with
 * structure-aware truncation, and make sure the note link is present (never cut).
 */
function buildOverrideText(override: string, noteUrl: string): string {
  const escaped = escapeSlack(override).trim()
  const linkLine = `노트 전체는 여기에서 볼 수 있어요: ${noteUrl}`
  if (escaped.includes(noteUrl)) {
    const cut = truncateForSlack(escaped, SLACK_TEXT_MAX - 1)
    if (cut.includes(noteUrl)) return cut
  }
  // Link absent (or cut away): truncate the body, leaving room, then append the link (check is post-truncation).
  const room = SLACK_TEXT_MAX - linkLine.length - 2 - 1
  const body = truncateForSlack(escaped.split(noteUrl).join('').trim(), room)
  return [body, linkLine].filter(Boolean).join('\n\n')
}

function slackErrorCode(err: unknown): string {
  const e = err as { code?: string; data?: { error?: string }; message?: string }
  return e?.data?.error ?? e?.code ?? e?.message ?? 'unknown'
}

/**
 * 챔피언에게 지정된 recap 채널 id를 읽는다. 마이그레이션 전이라 컬럼이 없거나 조회가 실패하면
 * 로그만 남기고 미설정(null)으로 본다 — 기존 발송 경로를 절대 막지 않는다.
 */
async function readRecapChannelId(supabase: SupabaseClient, userId: string, sessionId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('recap_slack_channel_id')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.error(`[session ${sessionId}] recap channel read failed (treated as unset):`, error.message)
      return null
    }
    const v = (data as { recap_slack_channel_id?: unknown } | null)?.recap_slack_channel_id
    return isRecapChannelId(v) ? v : null
  } catch (err) {
    console.error(`[session ${sessionId}] recap channel read failed (treated as unset):`, err instanceof Error ? err.message : 'unknown')
    return null
  }
}

function logDmFailure(sessionId: string, err: unknown) {
  const e = err as { code?: string; data?: { error?: string }; message?: string }
  if (e?.code === 'slack_webapi_platform_error') {
    console.error(`[session ${sessionId}] recap DM rejected by Slack: ${e.data?.error ?? 'unknown'}`)
  } else {
    console.error(
      `DM outcome may be unknown (possible delivery) for session ${sessionId}, claim rolled back (${e?.code ?? 'no_code'})`,
    )
  }
}

/**
 * 챔피언에게 recap을 보낸다. 지정된 recap 채널이 있으면 그 채널로, 없거나 Slack이 거절하면
 * 그룹 DM(어드민+챔피언) → 1:1 DM 순으로 보낸다. 중복 발송은 recap_sent_at 원자적 선점으로 막는다.
 * 절대 throw하지 않는다.
 */
export async function sendRecapToChampion(
  deps: SendRecapDeps,
  args: { sessionId: string; adminId: string; textOverride?: string; expectedDraftTs?: string },
): Promise<SendRecapResult> {
  const { supabase } = deps
  const { sessionId, adminId, textOverride, expectedDraftTs } = args
  let claimedAt: string | null = null

  const rollback = async () => {
    if (!claimedAt) return
    // Only release our own claim (a later claim by someone else must survive).
    const { error } = await supabase
      .from('check_up_sessions')
      .update({ recap_sent_at: null, recap_sent_by: null })
      .eq('id', sessionId)
      .eq('recap_sent_by', adminId)
      .eq('recap_sent_at', claimedAt)
    if (error) console.error(`[session ${sessionId}] recap claim rollback failed:`, error.message)
    claimedAt = null
  }

  try {
    const baseUrl = resolveBaseUrl(deps.baseUrl)
    const slack = deps.slackClient ?? recapSlack

    const { data: session, error: sessionError } = await supabase
      .from('check_up_sessions')
      .select('id, champion_user_id, title, session_date, notes, processing_status, recap_slack_ts')
      .eq('id', sessionId)
      .single()
    if (sessionError && !session && sessionError.code !== 'PGRST116') {
      console.error(`[session ${sessionId}] recap session read failed:`, sessionError.message)
      return { ok: false, reason: 'dm_failed' }
    }
    if (!session) return { ok: false, reason: 'not_found' }
    if (session.processing_status !== 'done') return { ok: false, reason: 'not_done' }
    if (expectedDraftTs !== undefined && expectedDraftTs !== session.recap_slack_ts) {
      return { ok: false, reason: 'stale_draft' }
    }

    const { data: champion } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', session.champion_user_id)
      .single()
    const { data: items, error: itemsError } = await supabase
      .from('session_action_items')
      .select('body, is_completed, display_order')
      .eq('session_id', sessionId)
      .order('display_order', { ascending: true })
    if (itemsError) {
      console.error(`[session ${sessionId}] recap action items read failed:`, itemsError.message)
      return { ok: false, reason: 'dm_failed' }
    }
    const email = typeof champion?.email === 'string' ? champion.email.trim() : ''
    const recapChannelId = await readRecapChannelId(supabase, session.champion_user_id, sessionId)
    if (!email && !recapChannelId) return { ok: false, reason: 'no_slack_user' }

    const championName: string = champion?.name ?? '챔피언'
    const noteUrl = buildNoteUrl({ baseUrl, sessionId })

    // Atomic claim: only one caller can flip recap_sent_at from null.
    const now = new Date()
    const nowIso = now.toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('check_up_sessions')
      .update({ recap_sent_at: nowIso, recap_sent_by: adminId })
      .eq('id', sessionId)
      .is('recap_sent_at', null)
      .select('id')
    if (claimError) {
      console.error(`[session ${sessionId}] recap claim failed:`, claimError.message)
      return { ok: false, reason: 'dm_failed' }
    }
    if (!claimed || claimed.length === 0) return { ok: false, reason: 'already_sent' }
    claimedAt = nowIso

    let slackUserId: string | undefined
    if (email) {
      try {
        const res = await slack.users.lookupByEmail({ email })
        slackUserId = res.user?.id
      } catch (err) {
        console.error(`[session ${sessionId}] recap Slack user lookup failed:`, err instanceof Error ? err.message : 'unknown error')
      }
    }

    const text =
      textOverride !== undefined && textOverride.trim() !== ''
        ? buildOverrideText(textOverride, noteUrl)
        : buildRecapText({
            championName,
            sessionTitle: session.title ?? null,
            sessionDate: session.session_date,
            notes: session.notes ?? '',
            actionItems: (items ?? []).map((a: { body: string; is_completed: boolean }) => ({
              body: a.body,
              is_completed: a.is_completed,
            })),
            noteUrl,
          })

    // 1순위: 어드민이 지정한 recap 채널(봇 초대 완료된 비공개 채널). 실패하면 그룹 DM/1:1 DM으로 폴백.
    if (recapChannelId) {
      try {
        await slack.chat.postMessage({ channel: recapChannelId, text, unfurl_links: false, unfurl_media: false })
        return {
          ok: true,
          championName,
          sentAt: now,
          slackUserId: slackUserId ?? null,
          destination: 'channel',
          channelId: recapChannelId,
        }
      } catch (err) {
        // Slack이 거절한 경우(not_in_channel, channel_not_found, is_archived 등)만 폴백한다.
        // 네트워크/타임아웃 등은 이미 전달됐을 수 있어 DM으로 또 보내면 중복이 되므로 기존처럼 실패 처리한다.
        if ((err as { code?: string })?.code !== 'slack_webapi_platform_error') {
          logDmFailure(sessionId, err)
          await rollback()
          return { ok: false, reason: 'dm_failed' }
        }
        console.error(
          `[session ${sessionId}] recap channel ${recapChannelId} rejected by Slack (${slackErrorCode(err)}), falling back to DM`,
        )
      }
    }

    if (!slackUserId) {
      await rollback()
      return { ok: false, reason: 'no_slack_user' }
    }

    // 어드민(claud, jennifer)+챔피언이 함께 있는 그룹 DM으로 보낸다. 열기에 실패하면(권한 미부여 등) 챔피언 1:1 DM으로 폴백.
    let channel = slackUserId
    let destination: 'group' | 'dm' = 'dm'
    const championSlackId = slackUserId
    const adminIds = (deps.adminSlackIds ?? defaultAdminSlackIds()).filter((id) => id !== championSlackId)
    if (adminIds.length > 0 && slack.conversations) {
      try {
        const users = Array.from(new Set([...adminIds, championSlackId])).join(',')
        const opened = await slack.conversations.open({ users })
        if (opened.channel?.id) {
          channel = opened.channel.id
          destination = 'group'
        }
      } catch (err) {
        const e = err as { data?: { error?: string }; message?: string }
        console.error(`[session ${sessionId}] recap group DM open failed, falling back to 1:1 DM:`, e?.data?.error ?? e?.message ?? 'unknown')
      }
    }

    try {
      await slack.chat.postMessage({ channel, text, unfurl_links: false, unfurl_media: false })
    } catch (err) {
      logDmFailure(sessionId, err)
      await rollback()
      return { ok: false, reason: 'dm_failed' }
    }
    return { ok: true, championName, sentAt: now, slackUserId, destination }
  } catch (err) {
    console.error(`[session ${sessionId}] recap send failed:`, err instanceof Error ? err.message : 'unknown error')
    try {
      await rollback()
    } catch {
      /* never throw */
    }
    return { ok: false, reason: 'dm_failed' }
  }
}
