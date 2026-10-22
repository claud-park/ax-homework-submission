import type { SupabaseClient } from '@supabase/supabase-js'
import type { WebClient } from '@slack/web-api'
import { buildDraftBlocks, buildRecapText } from './format'
import { recapSlack } from './slackClient'
import { buildNoteUrl, resolveBaseUrl, trimEnv } from './noteUrl'
import { classifyRecapDraftError, type RecapDraftErrorCode } from './draftError'

export interface PostRecapDraftDeps {
  supabase: SupabaseClient
  slackClient?: Pick<WebClient, 'chat'>
  env?: { channelId?: string; token?: string; baseUrl?: string }
  /** 수동 재게시 경로: 이미 발송(recap_sent_at)된 세션이면 게시하지 않고 거부한다. */
  refuseIfSent?: boolean
}

export type PostRecapDraftResult =
  | { posted: true }
  | {
      posted: false
      reason: 'not_configured' | 'not_found' | 'not_done' | 'already_sent' | 'slack_error' | 'db_error'
      errorCode?: RecapDraftErrorCode
    }

/**
 * recap_draft_error 를 별도 UPDATE 로 기록/해제한다(best-effort).
 * 마이그레이션 전 DB(컬럼 없음)에서도 게시 결과에 영향이 없어야 하므로 다른 UPDATE 와 합치지 않는다.
 * 절대 throw 하지 않고 error.message 만 로그한다.
 */
async function recordDraftError(
  supabase: SupabaseClient,
  sessionId: string,
  code: RecapDraftErrorCode | null,
): Promise<void> {
  try {
    const res = await supabase.from('check_up_sessions').update({ recap_draft_error: code }).eq('id', sessionId)
    const error = (res as { error?: { message?: unknown } } | null | undefined)?.error
    if (error) {
      console.error(`[session ${sessionId}] recap_draft_error 기록 실패:`, String(error.message ?? 'unknown'))
    }
  } catch (e) {
    console.error(`[session ${sessionId}] recap_draft_error 기록 실패:`, e instanceof Error ? e.message : 'unknown')
  }
}

/**
 * 노트 처리 완료 후 Admin 채널에 recap 초안을 올린다.
 * 절대 throw하지 않는다: 결과를 PostRecapDraftResult 로 반환하고, 오류는 로그만 남긴다.
 * 자동 호출부는 반환값을 무시한다. 설정 누락(not_configured)은 의도된 off 상태라 DB 를 건드리지 않는다.
 */
export async function postRecapDraft(deps: PostRecapDraftDeps, sessionId: string): Promise<PostRecapDraftResult> {
  try {
    const channelId = trimEnv(deps.env?.channelId ?? process.env.RECAP_SLACK_CHANNEL_ID)
    const token = trimEnv(deps.env?.token ?? process.env.RECAP_SLACK_BOT_TOKEN)
    const baseUrl = resolveBaseUrl(deps.env?.baseUrl)
    if (!channelId || !token) return { posted: false, reason: 'not_configured' }

    const { supabase } = deps
    const slackClient = deps.slackClient ?? recapSlack

    const { data: session } = await supabase
      .from('check_up_sessions')
      .select('id, champion_user_id, title, session_date, notes, processing_status, recap_sent_at')
      .eq('id', sessionId)
      .single()
    if (!session) return { posted: false, reason: 'not_found' }
    if (session.processing_status !== 'done') return { posted: false, reason: 'not_done' }
    if (deps.refuseIfSent && session.recap_sent_at) return { posted: false, reason: 'already_sent' }

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

    let res: { channel?: string; ts?: string }
    try {
      res = await slackClient.chat.postMessage({
        channel: channelId,
        text: `${championName} 챔피언 recap 초안`,
        blocks,
      })
    } catch (err) {
      const errorCode = classifyRecapDraftError(err)
      console.error(`[session ${sessionId}] recap draft post failed:`, err instanceof Error ? err.message : 'unknown error')
      await recordDraftError(supabase, sessionId, errorCode)
      return { posted: false, reason: 'slack_error', errorCode }
    }
    if (!res.channel || !res.ts) {
      console.error(`[session ${sessionId}] recap draft post returned no channel/ts`)
      await recordDraftError(supabase, sessionId, 'unknown')
      return { posted: false, reason: 'slack_error', errorCode: 'unknown' }
    }
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
      return { posted: false, reason: 'db_error' }
    }
    await recordDraftError(supabase, sessionId, null)
    return { posted: true }
  } catch (err) {
    console.error(`[session ${sessionId}] recap draft post failed:`, err instanceof Error ? err.message : 'unknown error')
    return { posted: false, reason: 'db_error' }
  }
}
