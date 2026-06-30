import type { SupabaseClient } from '@supabase/supabase-js'
import { computeUsage } from '@/lib/audio-pipeline/costs'
import { SummaryParseError } from '@/lib/audio-pipeline/errors'
import { summarizeTranscript } from '@/lib/audio-pipeline/summarize'
import { transcribeAudio } from '@/lib/audio-pipeline/transcribe'
import { combineSessionNotes } from '@/lib/audio-pipeline/notes'
// runAudioPipeline is only re-exported below, not used here
import type { ProcessUsage } from '@/lib/audio-pipeline/types'
import type { SessionActionItem } from '@/lib/types'
import { assessTranscript } from '@/lib/audio/quality'

const BUCKET = 'check-up-sessions'

export type { ProcessUsage } from '@/lib/audio-pipeline/types'
export { SummaryParseError } from '@/lib/audio-pipeline/errors'
export { runAudioPipeline } from '@/lib/audio-pipeline/process'
export { combineSessionNotes, AI_DIVIDER } from '@/lib/audio-pipeline/notes'

export interface ProcessResult {
  notes: string
  actionItems: SessionActionItem[]
  usage: ProcessUsage
  lowQuality?: boolean
}

async function downloadSessionAudio(
  supabase: SupabaseClient,
  audioFilePath: string
): Promise<ArrayBuffer> {
  const { data: audioData, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(audioFilePath)
  if (dlError || !audioData) {
    throw new Error(`오디오 다운로드 실패: ${dlError?.message ?? 'unknown'}`)
  }
  return audioData.arrayBuffer()
}

async function persistPipelineResult(
  supabase: SupabaseClient,
  sessionId: string,
  notes: string,
  actionItems: { body: string }[],
  status: 'done' | 'low_quality' = 'done'
): Promise<SessionActionItem[]> {
  await supabase.from('session_action_items').delete().eq('session_id', sessionId)
  await supabase
    .from('check_up_sessions')
    .update({ processing_status: status, notes, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (actionItems.length === 0) return []

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
  return data ?? []
}

/**
 * Session orchestration: download from Storage → transcribe (multi-chunk) → summarize → persist.
 * Assumes the audio already lives in Storage (clients upload via signed URL).
 * Sets processing_status as it advances (transcribing → summarizing → done/low_quality).
 * Preserves the user's handwritten notes by combining them with the AI summary.
 */
export async function processSessionAudio(
  supabase: SupabaseClient,
  sessionId: string,
  audioPaths: string[],
  durationSec: number
): Promise<ProcessResult> {
  await supabase.from('check_up_sessions')
    .update({ processing_status: 'transcribing' }).eq('id', sessionId)

  // 청크를 인덱스 순서대로 전사 후 join
  const parts: string[] = []
  for (const path of audioPaths) {
    const buf = await downloadSessionAudio(supabase, path)
    parts.push(await transcribeAudio(buf, path))
  }
  const transcript = parts.join(' ').trim()

  // Korean syllable chars are information-dense; 0.3 chars/sec is a practical floor
  const quality = assessTranscript(transcript, durationSec, { minCharsPerSec: 0.3 })

  await supabase.from('check_up_sessions')
    .update({ processing_status: 'summarizing', raw_transcript: transcript }).eq('id', sessionId)

  let summary
  try {
    summary = await summarizeTranscript(transcript)
  } catch (err) {
    if (err instanceof SummaryParseError) {
      await supabase
        .from('check_up_sessions')
        .update({ processing_status: 'error', notes: err.rawText, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
    throw err
  }

  const { data: prev } = await supabase
    .from('check_up_sessions')
    .select('notes')
    .eq('id', sessionId)
    .single()

  const qualityBanner = quality.ok ? '' : '> ⚠️ 전사 품질이 낮을 수 있습니다. 녹음 음량이 작거나 잡음이 많으면 재녹음/재처리를 권장합니다.\n\n'
  const combinedNotes = combineSessionNotes(prev?.notes ?? '', qualityBanner + summary.notes)

  const insertedActionItems = await persistPipelineResult(
    supabase, sessionId, combinedNotes, summary.actionItems, quality.ok ? 'done' : 'low_quality'
  )

  const usage = computeUsage(durationSec, summary.inputTokens, summary.outputTokens)
  return { notes: combinedNotes, actionItems: insertedActionItems, usage, lowQuality: !quality.ok }
}
