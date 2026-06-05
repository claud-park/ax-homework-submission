import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { HotlineMessage } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const championUserId = searchParams.get('champion')
  if (!championUserId) return NextResponse.json({ error: 'champion param required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*')
    .eq('champion_user_id', championUserId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 조회 시 admin 읽음 처리 (fire-and-forget)
  void supabase
    .from('hotline_messages')
    .update({ read_by_admin: true })
    .eq('champion_user_id', championUserId)
    .eq('sender_role', 'champion')
    .eq('read_by_admin', false)

  return NextResponse.json(data as HotlineMessage[])
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { champion_user_id?: string; body?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.champion_user_id || !body.body?.trim()) {
    return NextResponse.json({ error: 'champion_user_id and body required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: msg, error } = await supabase
    .from('hotline_messages')
    .insert({
      champion_user_id: body.champion_user_id,
      sender_id: admin.id,
      sender_role: 'admin',
      body: body.body.trim(),
      read_by_champion: false,
      read_by_admin: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(msg as HotlineMessage, { status: 201 })
}
