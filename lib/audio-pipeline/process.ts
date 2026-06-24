import { computeUsage } from '@/lib/audio-pipeline/costs'
import { summarizeTranscript } from '@/lib/audio-pipeline/summarize'
import { transcribeAudio } from '@/lib/audio-pipeline/transcribe'
import type { PipelineResult } from '@/lib/audio-pipeline/types'

/**
 * Pure audio pipeline: Whisper STT → Claude summary.
 * No Storage, DB, or status updates — safe to call from scripts or workers.
 */
export async function runAudioPipeline(
  audioBuffer: ArrayBuffer,
  filename: string,
  durationSec: number
): Promise<PipelineResult> {
  const transcript = await transcribeAudio(audioBuffer, filename)
  const { notes, actionItems, inputTokens, outputTokens } = await summarizeTranscript(transcript)

  return {
    transcript,
    notes,
    actionItems,
    usage: computeUsage(durationSec, inputTokens, outputTokens),
  }
}
