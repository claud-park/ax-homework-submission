import { NextRequest, NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { requireUser, requireAdmin } from '@/lib/api/guard'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const isAdmin = isAdminUser(user)
  const championId = req.nextUrl.searchParams.get('championId')

  // 결정적 정렬: session_date 동률 시 session_time → created_at 순으로 타이브레이크.
  // (기존엔 session_date 만 있어 같은 날짜 세션들의 순서가 비결정적이었음)
  let query = supabase
    .from('check_up_sessions')
    .select('*')
    .order('session_date', { ascending: false })
    .order('session_time', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

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
