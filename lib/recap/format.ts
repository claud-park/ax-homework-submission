// Pure formatting helpers for the Slack recap feature (no I/O, no env access).
import type { KnownBlock } from '@slack/web-api'
import { AI_DIVIDER_RE } from '@/lib/audio-pipeline/notes'

export const RECAP_ACTIONS = {
  send: 'recap_send',
  edit: 'recap_edit',
  editSubmit: 'recap_edit_submit',
} as const

const SLACK_TEXT_MAX = 2900

/** Returns the AI summary part of the notes (everything after the divider), or the whole note. */
export function extractAiSummary(notes: string): string {
  const parts = (notes ?? '').split(AI_DIVIDER_RE)
  const body = parts.length > 1 ? parts.slice(1).join('\n\n') : parts[0]
  return body.replace(/^>\s*⚠️.*\n+/, '').trim()
}

/** Escapes Slack control characters (order matters: & first). */
export function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function toSlackMrkdwn(md: string): string {
  return md
    .split('\n')
    .map((line) => {
      // Strip blockquote markers BEFORE escaping (they are a literal '>').
      let l = escapeSlack(line.replace(/^\s*>\s?/, ''))
      const heading = l.match(/^#{1,6}\s+(.*)$/)
      if (heading) return `*${heading[1].replace(/\*\*/g, '').trim()}*`
      l = l.replace(/^(\s*)[-*]\s+/, '$1• ')
      l = l.replace(/\*\*(.+?)\*\*/g, '*$1*')
      // Links are built after escaping: the angle brackets are ours; url/label are already escaped.
      l = l.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s|]+)\)/g, '<$2|$1>')
      return l
    })
    .join('\n')
}

/**
 * Truncates to ~max chars without leaving broken structure: no dangling surrogate,
 * no unterminated `<...` / `&...` token, no odd trailing `*`. Adds `…` when cut.
 */
export function truncateForSlack(text: string, max: number = SLACK_TEXT_MAX): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max)
  const nextIsBreak = /\s/.test(text[max])
  if (!nextIsBreak) {
    const ws = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'))
    if (ws > max - 200 && ws > 0) cut = cut.slice(0, ws)
  }
  // Drop incomplete trailing link/entity tokens (repeat: a partial entity can follow a partial link).
  cut = cut.replace(/<[^>]*$/, '').replace(/&[a-z]*$/, '')
  // Drop a dangling high surrogate.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  // Drop an unbalanced trailing bold marker (bold spans one line).
  const lastLine = cut.slice(cut.lastIndexOf('\n') + 1)
  if ((lastLine.match(/\*/g)?.length ?? 0) % 2 === 1) {
    const i = cut.lastIndexOf('*')
    cut = cut.slice(0, i) + cut.slice(i + 1)
  }
  return `${cut.trimEnd()}…`
}

const MAX_ACTION_ITEMS = 10
const MAX_ACTION_BODY = 150

export function buildRecapText(input: {
  championName: string
  sessionTitle: string | null
  sessionDate: string
  notes: string
  actionItems: { body: string; is_completed: boolean }[]
  noteUrl: string
}): string {
  const { championName, sessionTitle, sessionDate, notes, actionItems, noteUrl } = input
  const name = escapeSlack(truncateForSlack(championName, 50))
  const date = escapeSlack(sessionDate)
  const label = sessionTitle ? `${date} ${escapeSlack(truncateForSlack(sessionTitle, 100))}` : date
  const greeting = `안녕하세요, ${name} 챔피언님! ${label} 1:1 내용을 정리해 드려요.`

  const todo = actionItems.filter((a) => !a.is_completed)
  const shown = todo.slice(0, MAX_ACTION_ITEMS)
  const lines = shown.map((a, i) => `${i + 1}. ${escapeSlack(truncateForSlack(a.body, MAX_ACTION_BODY))}`)
  if (todo.length > shown.length) lines.push(`외 ${todo.length - shown.length}건`)
  const actionSection = todo.length ? `*액션 아이템*\n${lines.join('\n')}` : ''
  const linkLine = `노트 전체는 여기에서 볼 수 있어요: ${noteUrl}`

  // The recap never exceeds SLACK_TEXT_MAX so the draft preview equals what is sent.
  // The summary is the only part that shrinks; the link is always last and preserved.
  const fixed = [greeting, actionSection, linkLine].filter(Boolean).join('\n\n')
  const summaryHeader = '*요약*\n'
  const budget = SLACK_TEXT_MAX - fixed.length - summaryHeader.length - 4 - 1
  const summarySection =
    budget > 20
      ? `${summaryHeader}${truncateForSlack(toSlackMrkdwn(extractAiSummary(notes)), budget)}`
      : ''
  return [greeting, summarySection, actionSection, linkLine].filter(Boolean).join('\n\n')
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
    { type: 'context', elements: [{ type: 'mrkdwn', text: truncateForSlack(escapeSlack(title), 300) }] },
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

function formatKst(d: Date): string {
  return `${new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')} KST`
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
          text: `✅ ${escapeSlack(sentByLabel)}님이 ${escapeSlack(championName)} 챔피언에게 발송했어요 (${formatKst(sentAt)})`,
        },
      ],
    },
  ]
}
