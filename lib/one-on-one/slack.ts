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
