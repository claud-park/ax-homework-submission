import { WebClient } from '@slack/web-api'
import { type AdminId } from './google-auth'

export type { AdminId }

export const slack = new WebClient(process.env.SLACK_BOT_TOKEN!)

// env var가 undefined이면 빈 문자열 → 매핑 실패 → null 반환 (graceful)
const ADMIN_SLACK_MAP: Record<string, AdminId> = Object.fromEntries(
  (
    [
      [process.env.ADMIN_SLACK_CLAUD,    'claud'   ],
      [process.env.ADMIN_SLACK_ALEX,     'alex'    ],
      [process.env.ADMIN_SLACK_JENNIFER, 'jennifer'],
    ] as [string | undefined, AdminId][]
  ).filter(([k]) => k) as [string, AdminId][]
)

export function getAdminIdBySlackUserId(slackId: string): AdminId | null {
  return ADMIN_SLACK_MAP[slackId] ?? null
}

// AdminId → Slack user id (멘션용). env 미설정 시 null
export function getSlackUserIdByAdminId(adminId: AdminId): string | null {
  const map: Record<AdminId, string | undefined> = {
    claud:    process.env.ADMIN_SLACK_CLAUD,
    alex:     process.env.ADMIN_SLACK_ALEX,
    jennifer: process.env.ADMIN_SLACK_JENNIFER,
  }
  return map[adminId] ?? null
}

// 어드민 id 배열을 Slack 멘션(<@id>) 문자열로. id 없으면 원본 라벨로 fallback
export function renderAdminMentions(adminIds: string[]): string {
  return adminIds
    .map((a) => {
      const slackId = getSlackUserIdByAdminId(a as AdminId)
      return slackId ? `<@${slackId}>` : a
    })
    .join(' ')
}
