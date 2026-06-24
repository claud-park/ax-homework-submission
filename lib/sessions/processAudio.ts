import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import OpenAI from 'openai'
import { toFile } from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAudioType, MAX_AUDIO_BYTES, MAX_AUDIO_MB } from '@/lib/audio'
import type { SessionActionItem } from '@/lib/types'

const MODEL = 'claude-sonnet-4-6'
const BUCKET = 'check-up-sessions'
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export const AI_DIVIDER = '\n\n---\n\n**🤖 AI 요약**\n\n'

// Splits on the AI divider tolerantly: any emphasis markers (* _ ** __), 3+ dashes,
// and flexible blank lines — so an editor round-trip can't defeat de-nesting.
const AI_DIVIDER_RE = /\n+-{3,}\n+[*_]*🤖 AI 요약[*_]*\n+/

export function combineSessionNotes(prevNotes: string, summary: string): string {
  const userPart = (prevNotes ?? '').split(AI_DIVIDER_RE)[0].trimEnd()
  return userPart ? `${userPart}${AI_DIVIDER}${summary}` : summary
}

export interface ProcessUsage {
  stt: { durationSec: number; cost: number }
  claude: { inputTokens: number; outputTokens: number; cost: number }
  totalCost: number
}

export interface ProcessResult {
  notes: string
  actionItems: SessionActionItem[]
  usage: ProcessUsage
}

/** Error thrown when Claude returns output we cannot parse as JSON. */
export class SummaryParseError extends Error {
  rawText: string
  constructor(message: string, rawText: string) {
    super(message)
    this.name = 'SummaryParseError'
    this.rawText = rawText
  }
}

/**
 * Shared session-audio pipeline: download from Storage → Whisper STT → Claude
 * summary → persist notes + action items. Assumes the audio already lives in
 * Storage (clients upload directly via a signed URL to bypass the Vercel 4.5MB
 * function body limit). Used by both the process and reprocess routes.
 *
 * Sets processing_status as it advances (transcribing → summarizing → done) and
 * to 'error' on failure. Throws SummaryParseError on unparseable Claude output.
 */
export async function processSessionAudio(
  supabase: SupabaseClient,
  sessionId: string,
  audioFilePath: string,
  durationSec: number
): Promise<ProcessResult> {
  // 1. Download audio from Storage
  await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'transcribing' })
    .eq('id', sessionId)

  const { data: audioData, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(audioFilePath)
  if (dlError || !audioData) throw new Error(`오디오 다운로드 실패: ${dlError?.message ?? 'unknown'}`)

  const audioBuffer = await audioData.arrayBuffer()
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    const mb = (audioBuffer.byteLength / (1024 * 1024)).toFixed(1)
    throw new Error(`오디오가 너무 큽니다 (${mb}MB). Whisper 전사 한도는 ${MAX_AUDIO_MB}MB입니다. 더 짧게 녹음하거나 나눠서 업로드하세요.`)
  }

  // 2. Whisper STT (resolve format from the stored file extension)
  const { ext, contentType } = resolveAudioType(audioFilePath)
  const audioBlob = new Blob([audioBuffer], { type: contentType })
  const whisperFile = await toFile(audioBlob, `audio.${ext}`, { type: contentType })
  const transcription = await getOpenAI().audio.transcriptions.create({
    file: whisperFile,
    model: 'whisper-1',
    language: 'ko',
  })
  const transcript = transcription.text

  // 3. Claude summarization
  await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'summarizing', raw_transcript: transcript })
    .eq('id', sessionId)

  const prompt = `당신은 1:1 미팅 노트 작성 전문가입니다.
아래는 Admin과 Champion 간의 1-on-1 세션 전사 내용입니다.

다음 두 가지를 JSON으로 반환하세요:
1. "notes": 미팅 주요 내용 요약 (plain text, 한국어, 3~5문단)
2. "actionItems": 액션 아이템 배열 (각 항목은 { "body": string } 형식)

전사 내용:
${transcript}

JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`

  const { text, usage: claudeUsage } = await generateText({ model: anthropic(MODEL), prompt })

  let notes = ''
  let actionItems: { body: string }[] = []
  try {
    // Claude sometimes wraps JSON in code fences — strip them first
    let jsonStr = text.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const parsed = JSON.parse(jsonStr)
    notes = parsed.notes ?? ''
    actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : []
  } catch {
    // Claude returned non-JSON; surface the raw text so admin can review
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'error', notes: text, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    throw new SummaryParseError('AI 요약 결과를 파싱할 수 없습니다. 전사 텍스트를 확인하세요.', text)
  }

  // 4. Persist: replace action items, mark done
  // 기존 사용자 수기 노트 보존: 이전 AI 구분선 앞부분만 유지(재처리 시 중첩 방지)
  const { data: prev } = await supabase
    .from('check_up_sessions')
    .select('notes')
    .eq('id', sessionId)
    .single()
  const combinedNotes = combineSessionNotes(prev?.notes ?? '', notes)

  await supabase.from('session_action_items').delete().eq('session_id', sessionId)
  await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'done', notes: combinedNotes, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  let insertedActionItems: SessionActionItem[] = []
  if (actionItems.length > 0) {
    const { data } = await supabase
      .from('session_action_items')
      .insert(
        actionItems.map((item, idx) => ({
          session_id: sessionId,
          body: item.body,
          display_order: idx,
        }))
      )
      .select()
    insertedActionItems = data ?? []
  }

  const durationMin = durationSec / 60
  const whisperCost = durationMin * 0.006
  const claudeInputCost = ((claudeUsage.inputTokens ?? 0) / 1_000_000) * 3
  const claudeOutputCost = ((claudeUsage.outputTokens ?? 0) / 1_000_000) * 15
  const claudeCost = claudeInputCost + claudeOutputCost

  return {
    notes: combinedNotes,
    actionItems: insertedActionItems,
    usage: {
      stt: { durationSec, cost: whisperCost },
      claude: {
        inputTokens: claudeUsage.inputTokens ?? 0,
        outputTokens: claudeUsage.outputTokens ?? 0,
        cost: claudeCost,
      },
      totalCost: whisperCost + claudeCost,
    },
  }
}
