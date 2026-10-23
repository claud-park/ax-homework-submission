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

/** Reverse of escapeSlack (order matters: &amp; LAST, so `&amp;lt;` → `&lt;`, not `<`). */
export function unescapeSlack(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
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

// Progressive shrink levels for the action-item section: [max items, max chars per item (escaped)].
const ACTION_LEVELS: [number, number][] = [
  [10, 150],
  [5, 80],
  [3, 40],
  [0, 0],
]
const MIN_SUMMARY_ROOM = 200

export function buildRecapText(input: {
  championName: string
  sessionTitle: string | null
  sessionDate: string
  notes: string
  actionItems: { body: string; is_completed: boolean }[]
  noteUrl: string
}): string {
  const { championName, sessionTitle, sessionDate, notes, actionItems, noteUrl } = input
  // Escape FIRST, then cap the escaped text (structure-aware), so lengths are final.
  const name = truncateForSlack(escapeSlack(championName), 100)
  const date = escapeSlack(sessionDate)
  const label = sessionTitle ? `${date} ${truncateForSlack(escapeSlack(sessionTitle), 150)}` : date
  const greeting = `안녕하세요, ${name} 챔피언님! ${label} 1:1 내용을 정리해 드려요.`
  const linkLine = `노트 전체는 여기에서 볼 수 있어요: ${noteUrl}`

  const todo = actionItems.filter((a) => !a.is_completed)
  const escapedBodies = todo.map((a) => escapeSlack(a.body))
  const buildActions = (maxItems: number, maxChars: number): string => {
    if (!todo.length) return ''
    const lines = escapedBodies
      .slice(0, maxItems)
      .map((b, i) => `${i + 1}. ${truncateForSlack(b, maxChars)}`)
    const rest = todo.length - lines.length
    if (rest > 0) lines.push(`외 ${rest}건`)
    return `*액션 아이템*\n${lines.join('\n')}`
  }
  const fixedOf = (actionSection: string) =>
    [greeting, actionSection, linkLine].filter(Boolean).join('\n\n')

  // Shrink the action section until the fixed parts leave room for the summary.
  let actionSection = ''
  for (const [maxItems, maxChars] of ACTION_LEVELS) {
    actionSection = buildActions(maxItems, maxChars)
    if (fixedOf(actionSection).length <= SLACK_TEXT_MAX - MIN_SUMMARY_ROOM) break
  }
  // Last resort: drop the action section entirely; the link is never cut.
  if (fixedOf(actionSection).length > SLACK_TEXT_MAX) actionSection = ''

  const summaryHeader = '*요약*\n'
  const budget = SLACK_TEXT_MAX - fixedOf(actionSection).length - summaryHeader.length - 4 - 1
  const summarySection =
    budget > 20
      ? `${summaryHeader}${truncateForSlack(toSlackMrkdwn(extractAiSummary(notes)), budget)}`
      : ''
  return [greeting, summarySection, actionSection, linkLine].filter(Boolean).join('\n\n')
}

/**
 * NOTE: `recapText` is trusted to be already Slack-escaped (see `escapeSlack`) and <= 2900 chars.
 * Callers passing admin-typed text (e.g. modal edits) must escape/validate it first.
 */
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
  /** 실제 DM을 받은 Slack 사용자 id. 어디로 갔는지 보이도록 멘션 표기한다(수정 메시지라 알림은 가지 않는다). */
  recipientSlackId?: string
  /** 'channel'이면 지정 recap 채널, 'group'이면 어드민+챔피언 그룹 DM, 아니면 챔피언 1:1 DM. */
  destination?: 'channel' | 'group' | 'dm'
  /** destination === 'channel'일 때 보낸 채널 id. `<#id>` 채널 멘션으로 표기한다. */
  channelId?: string
}): KnownBlock[] {
  const { championName, sentByLabel, sentAt, recipientSlackId, destination, channelId } = input
  let dest = ''
  if (destination === 'channel') {
    dest = channelId && /^[CG][A-Z0-9]{8,}$/.test(channelId) ? ` · 수신: <#${channelId}> (채널)` : ''
  } else if (recipientSlackId && /^[UW][A-Z0-9]+$/.test(recipientSlackId)) {
    dest = ` · 수신: <@${recipientSlackId}> (${destination === 'group' ? '그룹 DM' : 'Slack DM'})`
  }
  return [
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `✅ ${escapeSlack(sentByLabel)}님이 ${escapeSlack(championName)} 챔피언에게 발송했어요 (${formatKst(sentAt)})${dest}`,
        },
      ],
    },
  ]
}
