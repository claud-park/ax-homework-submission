import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const championUserId = req.nextUrl.searchParams.get('championUserId')
  if (!championUserId) {
    return NextResponse.json({ error: 'championUserId required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('weekly_champion_updates')
    .select('*, weekly_session:champion_weekly_sessions(session_date, title)')
    .eq('champion_user_id', championUserId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
