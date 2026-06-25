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
      .eq('publish_status', 'published')
      .order('submitted_at', { ascending: false }),
    supabase
      .from('milestones')
      .select('*')
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

  const chartersWithComments = await Promise.all(
    (charterRows ?? []).map(async charter => {
      const { data: comments } = await supabase
        .from('charter_comments')
        .select('*, replies:charter_comments!parent_id(*)')
        .eq('charter_submission_id', charter.id)
        .is('parent_id', null)
        .order('created_at')
      return { ...charter, comments: comments ?? [] }
    })
  )

  const result: ChampionProject = {
    user: userRow,
    charters: chartersWithComments,
    milestones: milestones ?? [],
    latestSubmission: submissions?.[0] ?? null,
  }

  return NextResponse.json(result)
}
