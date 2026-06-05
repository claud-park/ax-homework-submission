import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { champion_user_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const isAdmin = user.user_metadata?.is_admin === true
  const supabase = createServiceClient()

  if (isAdmin) {
    // Admin이 읽으면: champion이 보낸 메시지를 read_by_admin = true
    if (!body.champion_user_id) {
      return NextResponse.json({ error: 'champion_user_id required' }, { status: 400 })
    }
    const { error } = await supabase
      .from('hotline_messages')
      .update({ read_by_admin: true })
      .eq('champion_user_id', body.champion_user_id)
      .eq('sender_role', 'champion')
      .eq('read_by_admin', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Champion이 읽으면: admin이 보낸 메시지를 read_by_champion = true
    const { error } = await supabase
      .from('hotline_messages')
      .update({ read_by_champion: true })
      .eq('champion_user_id', user.id)
      .eq('sender_role', 'admin')
      .eq('read_by_champion', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
