export interface ProcessUsage {
  stt: { durationSec: number; cost: number }
  claude: { inputTokens: number; outputTokens: number; cost: number }
  totalCost: number
}

/** Pure pipeline output before DB persistence. */
export interface PipelineResult {
  transcript: string
  notes: string
  actionItems: { body: string }[]
  usage: ProcessUsage
}
