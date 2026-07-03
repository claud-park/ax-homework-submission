import { NextRequest, NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/api/guard'

type Params = { params: { sessionId: string; commentId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('session_comments')
    .select('id, author_id')
    .eq('id', params.commentId)
    .eq('session_id', params.sessionId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('session_comments')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', params.commentId)
    .select('*, author:users(id,name,email)')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const isAdmin = isAdminUser(user)
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('session_comments')
    .select('id, author_id')
    .eq('id', params.commentId)
    .eq('session_id', params.sessionId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isAdmin && existing.author_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('session_comments')
    .delete()
    .eq('id', params.commentId)
    .eq('session_id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
