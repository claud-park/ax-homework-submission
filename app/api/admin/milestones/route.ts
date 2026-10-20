import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'
import { getCurrentSeasonIdOrNil } from '@/lib/data/season'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const supabase = createServiceClient()
  const seasonId = await getCurrentSeasonIdOrNil(supabase)
  const { data, error } = await supabase
    .from('milestones')
    .select('*, users(*), milestone_deliverables(*)').eq('season_id', seasonId)
    .eq('publish_status', 'published')
    .order('user_id').order('week_number').order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
