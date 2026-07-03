import { NextRequest, NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { requireUser } from '@/lib/api/guard'
import { GenerationOutputSchema, buildRefinePrompt } from '@/lib/milestone-ai'
import { draftToRelative, scheduleRelativeMilestones, type DraftLike } from '@/lib/milestone-schedule'

const MODEL = process.env.MILESTONE_AI_MODEL ?? 'claude-haiku-4-5'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const instruction: string = typeof body?.instruction === 'string' ? body.instruction : ''
  const milestones: DraftLike[] = Array.isArray(body?.milestones) ? body.milestones : []
  const rawStart: unknown = body?.startDate
  const startDate: string =
    typeof rawStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStart)
      ? rawStart
      : new Date().toISOString().slice(0, 10)

  if (!instruction.trim() || milestones.length === 0) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 })
  }

  const relative = draftToRelative(milestones, startDate)
  const prompt = buildRefinePrompt(relative, instruction)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: anthropic(MODEL),
        output: Output.object({ schema: GenerationOutputSchema }),
        prompt,
      })
      const scheduled = scheduleRelativeMilestones(startDate, output.milestones)
      return NextResponse.json({ milestones: scheduled })
    } catch {
      if (attempt === 1) {
        return NextResponse.json({ error: 'refine_failed' }, { status: 502 })
      }
    }
  }

  return NextResponse.json({ error: 'refine_failed' }, { status: 502 })
}
