import type { SupabaseClient } from '@supabase/supabase-js'
import { SummaryParseError } from '@/lib/audio-pipeline/errors'

/**
 * 1:1 노트 처리 실패 원인 코드. DB(check_up_sessions.processing_error)에는 이 코드만 저장한다.
 * (원본 메시지/SDK 에러 본문은 키·URL이 섞일 수 있어 저장하지 않는다.)
 */
export type ProcessingErrorCode =
  | 'stt_quota'
  | 'stt_rate_limited'
  | 'stt_auth'
  | 'summary_quota'
  | 'summary_auth'
  | 'upstream_unavailable'
  | 'summary_parse'
  | 'unknown'

export type ProcessingStage = 'stt' | 'summary'

const CODES: readonly string[] = [
  'stt_quota',
  'stt_rate_limited',
  'stt_auth',
  'summary_quota',
  'summary_auth',
  'upstream_unavailable',
  'summary_parse',
  'unknown',
]

export function isProcessingErrorCode(value: unknown): value is ProcessingErrorCode {
  return typeof value === 'string' && CODES.includes(value)
}

// 호출부(processAudio)가 에러 객체에 어느 단계에서 났는지 표시해 둔다. 에러 객체 자체는 변경하지 않는다.
const stageTags = new WeakMap<object, ProcessingStage>()

export function tagProcessingStage(err: unknown, stage: ProcessingStage): void {
  if (typeof err === 'object' && err !== null) stageTags.set(err, stage)
}

type Rec = Record<string, unknown>
const asRec = (v: unknown): Rec | undefined => (typeof v === 'object' && v !== null ? (v as Rec) : undefined)
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

const QUOTA_RE = /insufficient_quota|exceeded your current quota|no credits remaining|credit balance is too low/i
const NETWORK_RE = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR|fetch failed|socket hang up|abort(ed)?|timed? ?out|connection error|cannot connect to api|network/i
const ANTHROPIC_RE = /anthropic|credit balance is too low/i
const OPENAI_RE = /openai|insufficient_quota|exceeded your current quota|no credits remaining/i

function unwrap(err: unknown): unknown {
  let cur = err
  for (let i = 0; i < 3; i++) {
    const r = asRec(cur)
    if (r && r.name === 'AI_RetryError' && r.lastError) cur = r.lastError
    else break
  }
  return cur
}

function numStatus(r: Rec): number | undefined {
  for (const v of [r.status, r.statusCode, asRec(r.response)?.status]) {
    if (typeof v === 'number') return v
  }
  return undefined
}

function classify(raw: unknown, stageArg?: ProcessingStage): ProcessingErrorCode {
  if (raw instanceof SummaryParseError) return 'summary_parse'
  const rawObj = asRec(raw)
  const err = unwrap(raw)
  if (err instanceof SummaryParseError) return 'summary_parse'

  const r = asRec(err)
  const message = err instanceof Error ? err.message : asStr(r?.message)
  if (!r && !message) return 'unknown'

  const nested = asRec(r?.error)
  const data = asRec(r?.data)
  const dataErr = asRec(data?.error)
  const cause = asRec(r?.cause)
  const status = r ? numStatus(r) : undefined
  const codes = [r?.code, nested?.code, dataErr?.code, nested?.type, dataErr?.type, r?.type].map(asStr)
  const text = [message, asStr(r?.name), asStr(nested?.message), asStr(dataErr?.message), asStr(r?.responseBody).slice(0, 2000), ...codes].join(' ')
  const url = asStr(r?.url)

  const stage =
    stageArg ??
    (rawObj ? stageTags.get(rawObj) : undefined) ??
    (r ? stageTags.get(r) : undefined) ??
    inferStage(r, text, url)

  // quota: 단계가 불명확하면 메시지 문구로 추정(OpenAI/Anthropic 문구가 서로 다름).
  if (QUOTA_RE.test(text)) {
    if (stage) return stage === 'stt' ? 'stt_quota' : 'summary_quota'
    return 'unknown'
  }

  const causeCode = asStr(cause?.code)
  if (
    (status === undefined && (NETWORK_RE.test(text) || NETWORK_RE.test(causeCode))) ||
    (status !== undefined && (status >= 500 || status === 408))
  ) {
    return 'upstream_unavailable'
  }

  if (status === 429) {
    if (stage === 'stt') return 'stt_rate_limited'
    return 'upstream_unavailable' // 요약 단계 rate limit 전용 코드는 없고, 단계 불명이면 추정하지 않는다
  }
  if (status === 401 || status === 403) {
    if (stage === 'stt') return 'stt_auth'
    if (stage === 'summary') return 'summary_auth'
    return 'unknown'
  }
  return 'unknown'
}

function inferStage(r: Rec | undefined, text: string, url: string): ProcessingStage | undefined {
  const anthropic =
    r?.name === 'AI_APICallError' || /anthropic/i.test(url) || ANTHROPIC_RE.test(text)
  const openai = (r !== undefined && 'requestID' in r) || /openai/i.test(url) || OPENAI_RE.test(text)
  if (anthropic && !openai) return 'summary'
  if (openai && !anthropic) return 'stt'
  return undefined
}

export function classifyProcessingError(err: unknown, stage?: ProcessingStage): ProcessingErrorCode {
  try {
    return classify(err, stage)
  } catch {
    return 'unknown'
  }
}

/**
 * processing_error 컬럼을 별도 UPDATE 로 기록한다(best-effort).
 * 마이그레이션이 아직 적용되지 않은 DB 에서도 처리 상태 UPDATE 는 영향받지 않아야 하므로
 * 상태 UPDATE 와 절대 합치지 않는다. 절대 throw 하지 않고 error.message 만 로그한다.
 */
export async function recordProcessingError(
  supabase: SupabaseClient,
  sessionId: string,
  code: ProcessingErrorCode | null,
): Promise<void> {
  try {
    const res = await supabase
      .from('check_up_sessions')
      .update({ processing_error: code })
      .eq('id', sessionId)
    const error = (res as { error?: { message?: unknown } } | null | undefined)?.error
    if (error) {
      console.error(`[session ${sessionId}] processing_error 기록 실패:`, String(error.message ?? 'unknown'))
    }
  } catch (e) {
    console.error(`[session ${sessionId}] processing_error 기록 실패:`, e instanceof Error ? e.message : 'unknown')
  }
}
