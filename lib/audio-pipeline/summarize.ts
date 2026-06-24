import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { SummaryParseError } from '@/lib/audio-pipeline/errors'

const MODEL = 'claude-sonnet-4-6'

export interface SummarizeResult {
  notes: string
  actionItems: { body: string }[]
  inputTokens: number
  outputTokens: number
}

/** Parse Claude JSON output; throws on invalid JSON. */
export function parseSummaryResponse(text: string): Pick<SummarizeResult, 'notes' | 'actionItems'> {
  let jsonStr = text.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const parsed = JSON.parse(jsonStr)
  return {
    notes: parsed.notes ?? '',
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
  }
}

function buildSummaryPrompt(transcript: string): string {
  return `당신은 1:1 미팅 노트 작성 전문가입니다.
아래는 Admin과 Champion 간의 1-on-1 세션 전사 내용입니다.

다음 두 가지를 JSON으로 반환하세요:
1. "notes": 미팅 주요 내용 요약 (plain text, 한국어, 3~5문단)
2. "actionItems": 액션 아이템 배열 (각 항목은 { "body": string } 형식)

전사 내용:
${transcript}

JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`
}

/** Claude summarization — no Supabase or DB dependencies. */
export async function summarizeTranscript(transcript: string): Promise<SummarizeResult> {
  const { text, usage } = await generateText({
    model: anthropic(MODEL),
    prompt: buildSummaryPrompt(transcript),
  })

  try {
    const { notes, actionItems } = parseSummaryResponse(text)
    return {
      notes,
      actionItems,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    }
  } catch {
    throw new SummaryParseError('AI 요약 결과를 파싱할 수 없습니다. 전사 텍스트를 확인하세요.', text)
  }
}
