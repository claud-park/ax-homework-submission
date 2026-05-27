import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { ChampionProject } from '@/lib/types'

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = params
  const supabase = createServiceClient()

  const [
    { data: userRow, error: userErr },
    { data: charterRows, error: charterErr },
    { data: milestones, error: msErr },
    { data: submissions, error: subErr },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase
      .from('charter_submissions')
      .select('*')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1),
    supabase
      .from('milestones')
      .select('*, milestone_deliverables(*)')
      .eq('user_id', userId)
      .eq('publish_status', 'published')
      .order('week_number')
      .order('display_order'),
    supabase
      .from('submissions')
      .select('*')
      .eq('user_id', userId)
      .order('attempt_number', { ascending: false })
      .limit(1),
  ])

  if (userErr || !userRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (charterErr) return NextResponse.json({ error: charterErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

  const charter = charterRows?.[0] ?? null
  let charterWithComments = null
  if (charter) {
    const { data: comments } = await supabase
      .from('charter_comments')
      .select('*, replies:charter_comments!parent_id(*)')
      .eq('charter_submission_id', charter.id)
      .is('parent_id', null)
      .order('created_at')
    charterWithComments = { ...charter, comments: comments ?? [] }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (milestones ?? []).map(({ milestone_deliverables, ...rest }: any) => ({
    ...rest,
    deliverables: milestone_deliverables,
  }))

  const result: ChampionProject = {
    user: userRow,
    charter: charterWithComments,
    milestones: normalized,
    latestSubmission: submissions?.[0] ?? null,
  }

  return NextResponse.json(result)
}
