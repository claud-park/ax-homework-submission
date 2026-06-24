import type { ProcessUsage } from '@/lib/audio-pipeline/types'

/** Whisper + Claude cost estimates for a processed session. */
export function computeUsage(
  durationSec: number,
  inputTokens: number,
  outputTokens: number
): ProcessUsage {
  const durationMin = durationSec / 60
  const whisperCost = durationMin * 0.006
  const claudeInputCost = (inputTokens / 1_000_000) * 3
  const claudeOutputCost = (outputTokens / 1_000_000) * 15
  const claudeCost = claudeInputCost + claudeOutputCost

  return {
    stt: { durationSec, cost: whisperCost },
    claude: { inputTokens, outputTokens, cost: claudeCost },
    totalCost: whisperCost + claudeCost,
  }
}
