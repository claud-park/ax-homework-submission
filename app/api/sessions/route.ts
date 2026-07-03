import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireUser, requireAdmin } from '@/lib/api/guard'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const isAdmin = !!user.user_metadata?.is_admin
  const championId = req.nextUrl.searchParams.get('championId')

  let query = supabase
    .from('check_up_sessions')
    .select('*')
    .order('session_date', { ascending: false })

  if (isAdmin && championId) {
    query = query.eq('champion_user_id', championId)
  } else {
    // Champion: only own sessions regardless of param
    query = query.eq('champion_user_id', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { champion_user_id, session_date, session_time, title } = await req.json()
  if (!champion_user_id || !session_date || !title?.trim()) {
    return NextResponse.json({ error: 'champion_user_id, session_date, title required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('check_up_sessions')
    .insert({
      champion_user_id,
      admin_user_id: admin.id,
      session_date,
      title: title.trim(),
      ...(session_time ? { session_time } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Session not created' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
