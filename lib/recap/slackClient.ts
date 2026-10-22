import { WebClient } from '@slack/web-api'
import { trimEnv } from './noteUrl'

// recap 전용 Slack 앱(AX-1on1-Recap)의 봇 클라이언트.
// 기존 lib/one-on-one/slack.ts 의 SLACK_BOT_TOKEN(다른 앱)과 별개다.
export const recapSlack = new WebClient(trimEnv(process.env.RECAP_SLACK_BOT_TOKEN), {
  // 재시도 없음 + 짧은 타임아웃: 발송 선점(claim)을 잡은 채 함수가 죽거나 DM이 중복되는 것을 막는다.
  retryConfig: { retries: 0 },
  timeout: 8000,
})
