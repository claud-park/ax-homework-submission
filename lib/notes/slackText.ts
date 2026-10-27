import { AI_DIVIDER_RE } from '@/lib/audio-pipeline/notes'

const HR = '──────────'
const AI_HEADER = `${HR}\n*🤖 AI 요약*`

const ZWSP = '\u200B'
let alnumRe: RegExp | undefined
function isAlnum(ch: string): boolean {
  if (!alnumRe) {
    try {
      alnumRe = new RegExp('[\\p{L}\\p{N}]', 'u')
    } catch {
      alnumRe = /[A-Za-z0-9\uAC00-\uD7A3]/
    }
  }
  return alnumRe.test(ch)
}

// One left-to-right pass: each match is replaced once and never rescanned,
// so the output of one rule cannot be re-converted by another.
// Built lazily: lookbehind + \p{..} with the u flag throw a SyntaxError on
// old browsers (Safari < 16.4), which must not break module import.
function buildInlineRe(): RegExp {
  const L = '\\p{L}\\p{N}'
  return new RegExp(
    [
      // 1 backslash escape (CommonMark): must stay first so the char never acts as a marker
      '\\\\([!-\\/:-@\\[-`{-~])',
      // 2 image  3 url
      '!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)',
      // 4 label  5 url
      '\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)',
      // 6 inline code
      '`([^`]+)`',
      // 7 bold (**)
      '\\*\\*(?=\\S)(.+?)(?<=\\S)\\*\\*',
      // 8 bold (__)
      `(?<![${L}_])__(?=\\S)(.+?)(?<=\\S)__(?![${L}_])`,
      // 9 italic (*): ASCII-word neighbours (2*3, a*b*c) are left alone, Hangul is fine
      '(?<![A-Za-z0-9*/])\\*(?=[^\\s*])(.+?)(?<=[^\\s*])\\*(?!\\*)',
      // 10 italic (_): snake_case, _private_name and URL paths are left alone
      '(?<![A-Za-z0-9_/])_(?=[^\\s_])(.+?)(?<=[^\\s_])_(?![A-Za-z0-9_])',
    ].join('|'),
    'gu',
  )
}

let cachedInlineRe: RegExp | null | undefined
function getInlineRe(): RegExp | null {
  if (cachedInlineRe === undefined) {
    try {
      cachedInlineRe = buildInlineRe()
    } catch {
      cachedInlineRe = null
    }
  }
  return cachedInlineRe
}

type ReFactory = () => RegExp | null

/** Slack needs a boundary outside the markers: pad with U+200B next to letters/digits. */
function wrapSpan(marker: string, inner: string, offset: number, whole: string, len: number): string {
  const before = isAlnum(whole.charAt(offset - 1)) ? ZWSP : ''
  const after = isAlnum(whole.charAt(offset + len)) ? ZWSP : ''
  return `${before}${marker}${inner}${marker}${after}`
}

/** CommonMark: backslash + ASCII punctuation -> the literal char. */
function unescapeMd(text: string): string {
  return text.replace(/\\([!-/:-@[-`{-~])/g, '$1')
}

function inline(text: string, getRe: ReFactory, stripBold = false): string {
  const re = getRe()
  if (!re) return unescapeMd(stripBold ? text.replace(/\*\*/g, '') : text)
  return text.replace(re, (...args: unknown[]) => {
    const m = args[0] as string
    const g = args.slice(1, 11) as (string | undefined)[]
    const offset = args[11] as number
    const whole = args[12] as string
    const [escaped, imgAlt, imgUrl, label, url, code, bold1, bold2, it1, it2] = g
    if (escaped !== undefined) return escaped
    if (imgUrl !== undefined) return imgAlt ? `${imgAlt} (${imgUrl})` : imgUrl
    if (url !== undefined) return `${inline(label!, getRe, stripBold)} (${url})`
    if (code !== undefined) return code
    const bold = bold1 ?? bold2
    if (bold !== undefined) {
      const inner = inline(bold, getRe, stripBold)
      return stripBold ? inner : wrapSpan('*', inner, offset, whole, m.length)
    }
    return wrapSpan('_', inline((it1 ?? it2)!, getRe, stripBold), offset, whole, m.length)
  })
}

function convertLine(rawLine: string, getRe: ReFactory): string {
  let line = rawLine.replace(/\s+$/, '')
  // Normalise tabs (leading and inner) to 4 spaces.
  line = line.replace(/\t/g, '    ')
  // Blockquote markers.
  line = line.replace(/^\s*(?:>\s?)+/, '')
  if (!line.trim()) return ''

  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) return HR

  const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/)
  if (heading) {
    const title = inline(heading[1], getRe, true).trim()
    return title ? `*${title}*` : ''
  }

  const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/)
  if (task) {
    const mark = task[2] === ' ' ? '☐' : '☑'
    return `${task[1]}${mark} ${inline(task[3], getRe)}`
  }

  const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/)
  if (bullet) {
    const marker = bullet[1].length > 0 ? '◦' : '•'
    return `${bullet[1]}${marker} ${inline(bullet[2], getRe)}`
  }

  const ordered = line.match(/^(\s*)(\d+[.)])\s+(.*)$/)
  if (ordered) return `${ordered[1]}${ordered[2]} ${inline(ordered[3], getRe)}`

  const indent = line.match(/^\s*/)![0]
  return `${indent}${inline(line.slice(indent.length), getRe)}`
}

function convertBlock(block: string, getRe: ReFactory): string {
  return block
    .split(/\r?\n/)
    .map((line) => convertLine(line, getRe))
    .join('\n')
}

/**
 * Converts stored markdown notes to Slack-friendly plain text meant to be
 * pasted into Slack's composer. Pure. Does not escape & < >.
 */
export function notesToSlackText(notes: string, buildRe: ReFactory = getInlineRe): string {
  if (!notes || !notes.trim()) return ''
  const dividerRe = new RegExp(AI_DIVIDER_RE.source, 'g')
  const out = notes
    .split(dividerRe)
    .map((block) => convertBlock(block, buildRe))
    .join(`\n\n${AI_HEADER}\n\n`)
  return out.replace(/\n{3,}/g, '\n\n').trim()
}
