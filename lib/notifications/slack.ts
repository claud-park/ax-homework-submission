import { slack } from '@/lib/one-on-one/slack'

/**
 * 관리자 알림을 Slack 채널에 best-effort 로 함께 게시(이메일 단일 채널 이중화).
 *
 * - ADMIN_SLACK_CHANNEL_ID 또는 SLACK_BOT_TOKEN 미설정 시 조용히 스킵.
 * - 실패해도 throw 하지 않는다 → 이메일 발송 흐름에 절대 영향 없음.
 * - 이메일 설정(ADMIN_NOTIFICATION_EMAIL)과 독립적으로 동작한다.
 */
export async function postAdminSlack(text: string): Promise<void> {
  const channel = process.env.ADMIN_SLACK_CHANNEL_ID
  if (!channel || !process.env.SLACK_BOT_TOKEN) return
  try {
    await slack.chat.postMessage({ channel, text, unfurl_links: false })
  } catch (e) {
    console.error('[slack] admin notify failed:', e)
  }
}
