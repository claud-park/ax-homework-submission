import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: booking } = await supabase
    .from('one_on_one_bookings')
    .select('*')
    .eq('champion_user_id', user.id)
    .in('status', ['pending', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ booking: booking ?? null })
}
