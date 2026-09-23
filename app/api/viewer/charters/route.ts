import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { getPublicCharters } from '@/lib/data/viewer'
import { getCurrentSeasonId } from '@/lib/data/season'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const requestedSeasonId = req.nextUrl.searchParams.get('season')
  const seasonId = requestedSeasonId || (await getCurrentSeasonId(supabase))
  if (!seasonId) return NextResponse.json([])

  const charters = await getPublicCharters(supabase, seasonId)
  return NextResponse.json(charters)
}
