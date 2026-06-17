import { NextRequest, NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import {
  GenerationOutputSchema,
  buildGenerationPrompt,
  type CharterContent,
} from '@/lib/milestone-ai'
import { scheduleRelativeMilestones } from '@/lib/milestone-schedule'

const MODEL = process.env.MILESTONE_AI_MODEL ?? 'claude-haiku-4-5'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const prompt: string | undefined = body?.prompt
  const useCharter: boolean = body?.useCharter !== false
  const rawStart: unknown = body?.startDate
  const startDate: string =
    typeof rawStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStart)
      ? rawStart
      : new Date().toISOString().slice(0, 10)

  let charter: CharterContent = {}
  if (useCharter) {
    const charter_id: string | undefined = body?.charter_id
    const supabase = createServiceClient()
    let charterQuery = supabase
      .from('charter_submissions')
      .select('content')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (charter_id) charterQuery = charterQuery.eq('id', charter_id)
    const { data } = await charterQuery.limit(1).maybeSingle()
    charter = (data?.content as CharterContent) ?? {}
  }

  const fullPrompt = buildGenerationPrompt(charter, prompt)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: anthropic(MODEL),
        output: Output.object({ schema: GenerationOutputSchema }),
        prompt: fullPrompt,
      })
      const scheduled = scheduleRelativeMilestones(startDate, output.milestones)
      return NextResponse.json({ milestones: scheduled })
    } catch {
      if (attempt === 1) {
        return NextResponse.json({ error: 'generation_failed' }, { status: 502 })
      }
    }
  }

  return NextResponse.json({ error: 'generation_failed' }, { status: 502 })
}
