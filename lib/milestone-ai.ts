import { z } from 'zod'

const ChildSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  offset_days: z.number().int().min(0),
  duration_days: z.number().int().min(1),
})

const MilestoneSchema = ChildSchema.extend({
  children: z.array(ChildSchema).optional(),
})

export const GenerationOutputSchema = z.object({
  milestones: z.array(MilestoneSchema).min(1),
})

export type GenerationOutput = z.infer<typeof GenerationOutputSchema>

export interface CharterContent {
  summary?: string
  problem?: string
  user?: string
  goal?: string
  solution?: string
  build?: string
}

const FIELD_LABELS: Array<[keyof CharterContent, string]> = [
  ['problem', '문제'],
  ['user', '사용자'],
  ['goal', '목표'],
  ['solution', '솔루션'],
  ['build', '빌드 계획'],
]

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function buildGenerationPrompt(charter: CharterContent, userPrompt?: string): string {
  const lines: string[] = [
    '당신은 프로젝트 매니저입니다. 아래 정보를 바탕으로 실행 가능한 마일스톤 계획을 만드세요.',
    '규칙:',
    '- 절대 날짜를 만들지 마세요. 기간은 working days 기준의 offset_days(프로젝트 시작 기준 시작 오프셋)와 duration_days(기간)로만 표현합니다.',
    '- 5~8개의 최상위 마일스톤. 필요하면 각 항목에 1단계 깊이의 children을 둡니다.',
    '- 제목은 한국어로 간결하게.',
  ]
  const charterLines = FIELD_LABELS
    .filter(([k]) => charter[k] && stripHtml(charter[k]!))
    .map(([k, label]) => `- ${label}: ${stripHtml(charter[k]!)}`)
  if (charterLines.length) {
    lines.push('', '[Charter 내용]', ...charterLines)
  } else {
    lines.push('', '[Charter 내용 없음 — 일반적인 프로젝트 가정]')
  }
  if (userPrompt && userPrompt.trim()) {
    lines.push('', `[추가 요청] ${userPrompt.trim()}`)
  }
  return lines.join('\n')
}
