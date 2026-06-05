// app/api/admin/hotline/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { HotlineMessage, PendingAttachment, HotlineAttachment } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const championUserId = searchParams.get('champion')
  if (!championUserId) return NextResponse.json({ error: 'champion param required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*, attachments:hotline_attachments(*)')
    .eq('champion_user_id', championUserId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

  let body: { champion_user_id?: string; body?: string; attachments?: PendingAttachment[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.champion_user_id) {
    return NextResponse.json({ error: 'champion_user_id required' }, { status: 400 })
  }

  const strippedText = body.body?.replace(/<[^>]*>/g, '').trim() ?? ''
  const hasAttachments = (body.attachments?.length ?? 0) > 0
  if (!strippedText && !hasAttachments) {
    return NextResponse.json({ error: 'body or attachments required' }, { status: 400 })
  }

  if (hasAttachments) {
    const invalid = body.attachments!.find(a =>
      !a.file_name?.trim() || !a.file_path?.trim() ||
      typeof a.file_size !== 'number' || a.file_size <= 0 ||
      !a.mime_type?.trim()
    )
    if (invalid) return NextResponse.json({ error: 'Invalid attachment fields' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: msg, error } = await supabase
    .from('hotline_messages')
    .insert({
      champion_user_id: body.champion_user_id,
      sender_id: admin.id,
      sender_role: 'admin',
      body: body.body ?? '',
      read_by_champion: false,
      read_by_admin: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let attachments: HotlineAttachment[] = []
  if (hasAttachments) {
    const { data: inserted, error: attachmentError } = await supabase
      .from('hotline_attachments')
      .insert(
        body.attachments!.map(a => ({
          message_id: msg.id,
          file_name: a.file_name,
          file_path: a.file_path,
          file_size: a.file_size,
          mime_type: a.mime_type,
        }))
      )
      .select()
    if (attachmentError) return NextResponse.json({ error: attachmentError.message }, { status: 500 })
    attachments = (inserted ?? []) as HotlineAttachment[]
  }

  return NextResponse.json({ ...msg, attachments }, { status: 201 })
}
