import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'
import { getCurrentSeasonIdOrNil } from '@/lib/data/season'

export async function GET(req: NextRequest, { params }: { params: { weekNumber: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const weekNumber = parseInt(params.weekNumber)
  if (isNaN(weekNumber)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const supabase = createServiceClient()
  const seasonId = await getCurrentSeasonIdOrNil(supabase)
  const { data, error } = await supabase
    .from('milestones')
    .select('*, users(*), milestone_deliverables(*)').eq('season_id', seasonId)
    .eq('week_number', weekNumber)
    .eq('publish_status', 'published')
    .order('user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week_number: weekNumber, milestones: data })
}
