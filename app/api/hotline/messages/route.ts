// app/api/hotline/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyHotlineMessage } from '@/lib/notifications'
import type { HotlineMessage, PendingAttachment, HotlineAttachment } from '@/lib/types'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*, attachments:hotline_attachments(*)')
    .eq('champion_user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as HotlineMessage[])
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.user_metadata?.is_admin === true) {
    return NextResponse.json({ error: 'Admins use /api/admin/hotline/messages' }, { status: 403 })
  }

  let body: { body?: string; attachments?: PendingAttachment[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
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

  const championName = (user.user_metadata?.name as string | undefined) ?? user.email ?? '챔피언'
  notifyHotlineMessage({ champion: { id: user.id, name: championName }, body: body.body ?? '' })
    .catch(() => {})

  return NextResponse.json({ ...msg, attachments }, { status: 201 })
}
