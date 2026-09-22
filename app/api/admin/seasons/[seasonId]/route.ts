import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentSeasonId } from '@/lib/data/season'
import { getPreviousSeasonRoster, getSeasonEnrollments, getUnassignedUsers } from '@/lib/data/seasons-admin'

export async function GET(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  const { data: season, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('id', params.seasonId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  const currentSeasonId = await getCurrentSeasonId(supabase)
  const [previousRoster, currentEnrollments, unassignedUsers] = await Promise.all([
    currentSeasonId && currentSeasonId !== params.seasonId
      ? getPreviousSeasonRoster(supabase, currentSeasonId)
      : Promise.resolve([]),
    getSeasonEnrollments(supabase, params.seasonId),
    getUnassignedUsers(supabase, params.seasonId),
  ])

  return NextResponse.json({ season, previousRoster, currentEnrollments, unassignedUsers })
}
