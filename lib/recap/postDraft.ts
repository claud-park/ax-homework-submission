import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebClient } from '@slack/web-api'
import { buildDraftBlocks, buildRecapText } from './format'
import { recapSlack } from './slackClient'

export interface PostRecapDraftDeps {
  supabase: SupabaseClient
  slackClient?: Pick<WebClient, 'chat'>
  env?: { channelId?: string; token?: string; baseUrl?: string }
}

/**
 * 노트 처리 완료 후 Admin 채널에 recap 초안을 올린다.
 * 절대 throw하지 않는다: 설정이 없거나 Slack/DB 오류가 나도 조용히 로그만 남긴다.
 */
export async function postRecapDraft(deps: PostRecapDraftDeps, sessionId: string): Promise<void> {
  try {
    const channelId = deps.env?.channelId ?? process.env.RECAP_SLACK_CHANNEL_ID
    const token = deps.env?.token ?? process.env.RECAP_SLACK_BOT_TOKEN
    const baseUrl = deps.env?.baseUrl ?? process.env.APP_BASE_URL ?? 'http://localhost:3000'
    if (!channelId || !token) return

    const { supabase } = deps
    const slackClient = deps.slackClient ?? recapSlack

    const { data: session } = await supabase
      .from('check_up_sessions')
      .select('id, champion_user_id, title, session_date, notes, processing_status, recap_sent_at')
      .eq('id', sessionId)
      .single()
    if (!session || session.processing_status !== 'done') return

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

    const championName = champion?.name ?? champion?.email ?? '챔피언'
    const previouslySent = Boolean(session.recap_sent_at)
    const recapText = buildRecapText({
      championName,
      sessionTitle: session.title ?? null,
      sessionDate: session.session_date,
      notes: session.notes ?? '',
      actionItems: (items ?? []).map((a: { body: string; is_completed: boolean }) => ({
        body: a.body,
        is_completed: a.is_completed,
      })),
      noteUrl: `${baseUrl}/admin/champions/${session.champion_user_id}`,
    })
    const blocks = buildDraftBlocks({
      sessionId,
      championName,
      sessionTitle: session.title ?? null,
      sessionDate: session.session_date,
      recapText,
      previouslySent,
    })

    // 재처리: 이전 발송 상태와 옛 초안 위치를 비운다(게시 실패 시 stale ts가 남지 않도록 먼저 비움).
    await supabase
      .from('check_up_sessions')
      .update({ recap_sent_at: null, recap_sent_by: null, recap_slack_channel: null, recap_slack_ts: null })
      .eq('id', sessionId)

    const res = await slackClient.chat.postMessage({
      channel: channelId,
      text: `${championName} 챔피언 recap 초안`,
      blocks,
    })
    if (res.channel && res.ts) {
      await supabase
        .from('check_up_sessions')
        .update({ recap_slack_channel: res.channel, recap_slack_ts: res.ts })
        .eq('id', sessionId)
    }
  } catch (err) {
    console.error(`[session ${sessionId}] recap draft post failed:`, err instanceof Error ? err.message : 'unknown error')
  }
}
