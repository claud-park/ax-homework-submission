import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { isChampionConnected } from '@/lib/one-on-one/champion-google'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const [{ data: booking }, championConnected] = await Promise.all([
    supabase
      .from('one_on_one_bookings')
      .select('*')
      .eq('champion_user_id', user.id)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    isChampionConnected(user.id),
  ])

  return NextResponse.json({ booking: booking ?? null, championConnected })
}
