import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebClient } from '@slack/web-api'
import { buildRecapText, escapeSlack, truncateForSlack } from './format'
import { recapSlack } from './slackClient'

export interface SendRecapDeps {
  supabase: SupabaseClient
  slackClient?: Pick<WebClient, 'chat' | 'users'>
  baseUrl?: string
}

export type SendRecapResult =
  | { ok: true; championName: string; sentAt: Date }
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
  if (escaped.includes(noteUrl)) return truncateForSlack(escaped, SLACK_TEXT_MAX - 1)
  const linkLine = `노트 전체는 여기에서 볼 수 있어요: ${noteUrl}`
  const room = SLACK_TEXT_MAX - linkLine.length - 2 - 1
  return [truncateForSlack(escaped, room), linkLine].filter(Boolean).join('\n\n')
}

/**
 * 챔피언에게 recap DM을 보낸다. 중복 발송은 recap_sent_at 원자적 선점으로 막는다.
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
    const baseUrl = deps.baseUrl ?? process.env.APP_BASE_URL ?? 'http://localhost:3000'
    const slack = deps.slackClient ?? recapSlack

    const { data: session } = await supabase
      .from('check_up_sessions')
      .select('id, champion_user_id, title, session_date, notes, processing_status, recap_slack_ts')
      .eq('id', sessionId)
      .single()
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
    const { data: items } = await supabase
      .from('session_action_items')
      .select('body, is_completed, display_order')
      .eq('session_id', sessionId)
      .order('display_order', { ascending: true })
    if (!champion?.email) return { ok: false, reason: 'no_slack_user' }

    const championName: string = champion.name ?? champion.email
    const noteUrl = `${baseUrl}/admin/champions/${session.champion_user_id}`

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
    try {
      const res = await slack.users.lookupByEmail({ email: champion.email })
      slackUserId = res.user?.id
    } catch (err) {
      console.error(`[session ${sessionId}] recap Slack user lookup failed:`, err instanceof Error ? err.message : 'unknown error')
    }
    if (!slackUserId) {
      await rollback()
      return { ok: false, reason: 'no_slack_user' }
    }

    const text =
      textOverride !== undefined
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

    try {
      await slack.chat.postMessage({ channel: slackUserId, text })
    } catch (err) {
      console.error(`[session ${sessionId}] recap DM failed:`, err instanceof Error ? err.message : 'unknown error')
      await rollback()
      return { ok: false, reason: 'dm_failed' }
    }
    return { ok: true, championName, sentAt: now }
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
