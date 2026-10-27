import { AI_DIVIDER_RE } from '@/lib/audio-pipeline/notes'

const HR = '──────────'
const AI_HEADER = `${HR}\n*🤖 AI 요약*`

const L = '\\p{L}\\p{N}'

// One left-to-right pass: each match is replaced once and never rescanned,
// so the output of one rule cannot be re-converted by another.
const INLINE_RE = new RegExp(
  [
    // 1 image  2 url
    '!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)',
    // 3 label  4 url
    '\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)',
    // 5 inline code
    '`([^`]+)`',
    // 6 bold (**)
    '\\*\\*(?=\\S)(.+?)(?<=\\S)\\*\\*',
    // 7 bold (__)
    `(?<![${L}_])__(?=\\S)(.+?)(?<=\\S)__(?![${L}_])`,
    // 8 italic (*)
    `(?<![${L}*])\\*(?=[^\\s*])(.+?)(?<=[^\\s*])\\*(?![${L}*])`,
    // 9 italic (_)
    `(?<![${L}_])_(?=[^\\s_])(.+?)(?<=[^\\s_])_(?![${L}_])`,
  ].join('|'),
  'gu',
)

function inline(text: string, stripBold = false): string {
  return text.replace(
    INLINE_RE,
    (
      _m,
      imgAlt: string | undefined,
      imgUrl: string | undefined,
      label: string | undefined,
      url: string | undefined,
      code: string | undefined,
      bold1: string | undefined,
      bold2: string | undefined,
      it1: string | undefined,
      it2: string | undefined,
    ) => {
      if (imgUrl !== undefined) return imgAlt ? `${imgAlt} (${imgUrl})` : imgUrl
      if (url !== undefined) return `${inline(label!, stripBold)} (${url})`
      if (code !== undefined) return code
      const bold = bold1 ?? bold2
      if (bold !== undefined) {
        const inner = inline(bold, stripBold)
        return stripBold ? inner : `*${inner}*`
      }
      const italic = it1 ?? it2
      return `_${inline(italic!, stripBold)}_`
    },
  )
}

function convertLine(rawLine: string): string {
  let line = rawLine.replace(/\s+$/, '')
  // Normalise tabs (leading and inner) to 4 spaces.
  line = line.replace(/\t/g, '    ')
  // Blockquote markers.
  line = line.replace(/^\s*(?:>\s?)+/, '')
  if (!line.trim()) return ''

  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return HR

  const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/)
  if (heading) {
    const title = inline(heading[1], true).trim()
    return title ? `*${title}*` : ''
  }

  const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/)
  if (task) {
    const mark = task[2] === ' ' ? '☐' : '☑'
    return `${task[1]}${mark} ${inline(task[3])}`
  }

  const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/)
  if (bullet) {
    const marker = bullet[1].length > 0 ? '◦' : '•'
    return `${bullet[1]}${marker} ${inline(bullet[2])}`
  }

  const ordered = line.match(/^(\s*)(\d+[.)])\s+(.*)$/)
  if (ordered) return `${ordered[1]}${ordered[2]} ${inline(ordered[3])}`

  const indent = line.match(/^\s*/)![0]
  return `${indent}${inline(line.slice(indent.length))}`
}

function convertBlock(block: string): string {
  return block.split(/\r?\n/).map(convertLine).join('\n')
}

/**
 * Converts stored markdown notes to Slack-friendly plain text meant to be
 * pasted into Slack's composer. Pure. Does not escape & < >.
 */
export function notesToSlackText(notes: string): string {
  if (!notes || !notes.trim()) return ''
  const dividerRe = new RegExp(AI_DIVIDER_RE.source, 'g')
  const out = notes
    .split(dividerRe)
    .map(convertBlock)
    .join(`\n\n${AI_HEADER}\n\n`)
  return out.replace(/\n{3,}/g, '\n\n').trim()
}
