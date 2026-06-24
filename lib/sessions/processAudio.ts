import type { SupabaseClient } from '@supabase/supabase-js'
import { computeUsage } from '@/lib/audio-pipeline/costs'
import { SummaryParseError } from '@/lib/audio-pipeline/errors'
import { summarizeTranscript } from '@/lib/audio-pipeline/summarize'
import { transcribeAudio } from '@/lib/audio-pipeline/transcribe'
import { combineSessionNotes } from '@/lib/audio-pipeline/notes'
// runAudioPipeline is only re-exported below, not used here
import type { ProcessUsage } from '@/lib/audio-pipeline/types'
import type { SessionActionItem } from '@/lib/types'

const BUCKET = 'check-up-sessions'

export type { ProcessUsage } from '@/lib/audio-pipeline/types'
export { SummaryParseError } from '@/lib/audio-pipeline/errors'
export { runAudioPipeline } from '@/lib/audio-pipeline/process'
export { combineSessionNotes, AI_DIVIDER } from '@/lib/audio-pipeline/notes'

export interface ProcessResult {
  notes: string
  actionItems: SessionActionItem[]
  usage: ProcessUsage
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
  actionItems: { body: string }[]
): Promise<SessionActionItem[]> {
  await supabase.from('session_action_items').delete().eq('session_id', sessionId)
  await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'done', notes, updated_at: new Date().toISOString() })
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
 * Session orchestration: download from Storage → transcribe → summarize → persist.
 * Assumes the audio already lives in Storage (clients upload via signed URL).
 * Sets processing_status as it advances (transcribing → summarizing → done).
 * Preserves the user's handwritten notes by combining them with the AI summary.
 */
export async function processSessionAudio(
  supabase: SupabaseClient,
  sessionId: string,
  audioFilePath: string,
  durationSec: number
): Promise<ProcessResult> {
  await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'transcribing' })
    .eq('id', sessionId)

  const audioBuffer = await downloadSessionAudio(supabase, audioFilePath)
  const transcript = await transcribeAudio(audioBuffer, audioFilePath)

  await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'summarizing', raw_transcript: transcript })
    .eq('id', sessionId)

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

  // Preserve the user's handwritten notes: keep the part before the AI divider
  // (so reprocess doesn't nest), then append the fresh summary below the divider.
  const { data: prev } = await supabase
    .from('check_up_sessions')
    .select('notes')
    .eq('id', sessionId)
    .single()
  const combinedNotes = combineSessionNotes(prev?.notes ?? '', summary.notes)

  const insertedActionItems = await persistPipelineResult(
    supabase,
    sessionId,
    combinedNotes,
    summary.actionItems
  )

  const usage = computeUsage(durationSec, summary.inputTokens, summary.outputTokens)

  return {
    notes: combinedNotes,
    actionItems: insertedActionItems,
    usage,
  }
}
