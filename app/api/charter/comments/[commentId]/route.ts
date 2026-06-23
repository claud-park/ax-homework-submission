import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('charter_comments')
    .select('id, author_id')
    .eq('id', params.commentId)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await supabase
    .from('charter_comments')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', params.commentId)
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('charter_comments')
    .select('id, author_id')
    .eq('id', params.commentId)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isAdmin && existing.author_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { error } = await supabase
    .from('charter_comments')
    .delete()
    .eq('id', params.commentId)
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
