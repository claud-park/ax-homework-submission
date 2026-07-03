// app/api/hotline/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, isAdminUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyHotlineMessage } from '@/lib/notifications'
import type { HotlineMessage } from '@/lib/types'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*')
    .eq('champion_user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as HotlineMessage[])
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isAdminUser(user)) {
    return NextResponse.json({ error: 'Admins use /api/admin/hotline/messages' }, { status: 403 })
  }

  let body: { body?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const strippedText = body.body?.replace(/<[^>]*>/g, '').trim() ?? ''
  if (!strippedText) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: msg, error } = await supabase
    .from('hotline_messages')
    .insert({
      champion_user_id: user.id,
      sender_id: user.id,
      sender_role: 'champion',
      body: body.body ?? '',
      read_by_champion: true,
      read_by_admin: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const championName = (user.user_metadata?.name as string | undefined) ?? user.email ?? '챔피언'
  notifyHotlineMessage({ champion: { id: user.id, name: championName }, body: body.body ?? '' })
    .catch(() => {})

  return NextResponse.json(msg as HotlineMessage, { status: 201 })
}
