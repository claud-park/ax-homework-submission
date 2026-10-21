import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebClient } from '@slack/web-api'
import { buildDraftBlocks, buildRecapText } from './format'
import { recapSlack } from './slackClient'
import { buildNoteUrl, resolveBaseUrl, trimEnv } from './noteUrl'

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
    const channelId = trimEnv(deps.env?.channelId ?? process.env.RECAP_SLACK_CHANNEL_ID)
    const token = trimEnv(deps.env?.token ?? process.env.RECAP_SLACK_BOT_TOKEN)
    const baseUrl = resolveBaseUrl(deps.env?.baseUrl)
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
      noteUrl: buildNoteUrl({ baseUrl, sessionId }),
    })
    const blocks = buildDraftBlocks({
      sessionId,
      championName,
      sessionTitle: session.title ?? null,
      sessionDate: session.session_date,
      recapText,
      previouslySent,
    })

    const res = await slackClient.chat.postMessage({
      channel: channelId,
      text: `${championName} 챔피언 recap 초안`,
      blocks,
    })
    if (res.channel && res.ts) {
      // 게시 성공 후에만 한 번에 갱신: 새 위치 저장 + 발송 상태 초기화.
      // 실패 경로에서는 recap_sent_at/by 를 건드리지 않아 "이미 발송됨" 정보가 보존된다.
      const { error } = await supabase
        .from('check_up_sessions')
        .update({
          recap_slack_channel: res.channel,
          recap_slack_ts: res.ts,
          recap_sent_at: null,
          recap_sent_by: null,
        })
        .eq('id', sessionId)
      if (error) {
        console.error(`[session ${sessionId}] recap draft posted but state update failed:`, error.message)
      }
    }
  } catch (err) {
    console.error(`[session ${sessionId}] recap draft post failed:`, err instanceof Error ? err.message : 'unknown error')
  }
}
