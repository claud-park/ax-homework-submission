// Pure formatting helpers for the Slack recap feature (no I/O, no env access).
import type { KnownBlock } from '@slack/web-api'
import { AI_DIVIDER_RE } from '@/lib/audio-pipeline/notes'

export const RECAP_ACTIONS = {
  send: 'recap_send',
  edit: 'recap_edit',
  editSubmit: 'recap_edit_submit',
} as const

const SLACK_TEXT_MAX = 2900
const SLACK_HARD_MAX = 3000

/** Returns the AI summary part of the notes (everything after the divider), or the whole note. */
export function extractAiSummary(notes: string): string {
  const parts = (notes ?? '').split(AI_DIVIDER_RE)
  const body = parts.length > 1 ? parts.slice(1).join('\n\n') : parts[0]
  return body.replace(/^>\s*⚠️.*\n+/, '').trim()
}

export function toSlackMrkdwn(md: string): string {
  return md
    .split('\n')
    .map((line) => {
      let l = line.replace(/^\s*>\s?/, '')
      const heading = l.match(/^#{1,6}\s+(.*)$/)
      if (heading) return `*${heading[1].replace(/\*\*/g, '').trim()}*`
      l = l.replace(/^(\s*)[-*]\s+/, '$1• ')
      l = l.replace(/\*\*(.+?)\*\*/g, '*$1*')
      l = l.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<$2|$1>')
      return l
    })
    .join('\n')
}

export function truncateForSlack(text: string, max: number = SLACK_TEXT_MAX): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function buildRecapText(input: {
  championName: string
  sessionTitle: string | null
  sessionDate: string
  notes: string
  actionItems: { body: string; is_completed: boolean }[]
  noteUrl: string
}): string {
  const { championName, sessionTitle, sessionDate, notes, actionItems, noteUrl } = input
  const label = sessionTitle ? `${sessionDate} ${sessionTitle}` : sessionDate
  const greeting = `안녕하세요, ${championName} 챔피언님! ${label} 1:1 내용을 정리해 드려요.`

  const todo = actionItems.filter((a) => !a.is_completed)
  const actionSection = todo.length
    ? `*액션 아이템*\n${todo.map((a, i) => `${i + 1}. ${a.body}`).join('\n')}`
    : ''
  const linkLine = `노트 전체는 여기에서 볼 수 있어요: ${noteUrl}`

  // Reserve room for fixed parts so the summary is what gets truncated.
  const fixed = [greeting, actionSection, linkLine].filter(Boolean).join('\n\n')
  const summaryBudget = Math.max(0, SLACK_HARD_MAX - fixed.length - '*요약*\n'.length - 4 - 2)
  const summary = truncateForSlack(
    toSlackMrkdwn(extractAiSummary(notes)),
    Math.min(SLACK_TEXT_MAX, summaryBudget),
  )

  const text = [greeting, `*요약*\n${summary}`, actionSection, linkLine].filter(Boolean).join('\n\n')
  return text.length <= SLACK_HARD_MAX ? text : text.slice(0, SLACK_HARD_MAX)
}

export function buildDraftBlocks(input: {
  sessionId: string
  championName: string
  sessionTitle: string | null
  sessionDate: string
  recapText: string
  previouslySent: boolean
}): KnownBlock[] {
  const { sessionId, championName, sessionTitle, sessionDate, recapText, previouslySent } = input
  const title = sessionTitle ? `${sessionDate} ${sessionTitle}` : sessionDate
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: truncateForSlack(`${championName} 챔피언 recap 초안`, 140) },
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: truncateForSlack(title, 300) }] },
    { type: 'section', text: { type: 'mrkdwn', text: truncateForSlack(recapText) } },
  ]
  if (previouslySent) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '⚠️ 이전 recap이 이미 발송됐어요' }],
    })
  }
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: RECAP_ACTIONS.send,
        text: { type: 'plain_text', text: '챔피언에게 발송' },
        style: 'primary',
        value: sessionId,
      },
      {
        type: 'button',
        action_id: RECAP_ACTIONS.edit,
        text: { type: 'plain_text', text: '수정 후 발송' },
        value: sessionId,
      },
    ],
  })
  return blocks
}

export function buildSentBlocks(input: {
  championName: string
  sentByLabel: string
  sentAt: Date
}): KnownBlock[] {
  const { championName, sentByLabel, sentAt } = input
  return [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `✅ ${sentByLabel}님이 ${championName} 챔피언에게 발송했어요 (${sentAt.toISOString()})`,
        },
      ],
    },
  ]
}
