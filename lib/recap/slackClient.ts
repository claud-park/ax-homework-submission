import { WebClient } from '@slack/web-api'

// recap 전용 Slack 앱(AX-1on1-Recap)의 봇 클라이언트.
// 기존 lib/one-on-one/slack.ts 의 SLACK_BOT_TOKEN(다른 앱)과 별개다.
export const recapSlack = new WebClient(process.env.RECAP_SLACK_BOT_TOKEN)
