import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()

  // Verify charter access
  const { data: charter } = await supabase
    .from('charter_submissions')
    .select('id, user_id')
    .eq('id', params.id)
    .single()
  if (!charter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isAdmin && charter.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Verify parent is top-level (no reply-to-reply)
  const { data: parent } = await supabase
    .from('charter_comments')
    .select('id, parent_id')
    .eq('id', params.commentId)
    .eq('charter_submission_id', params.id)
    .single()
  if (!parent) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  if (parent.parent_id !== null) return NextResponse.json({ error: 'Cannot reply to a reply' }, { status: 400 })

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const { data, error } = await supabase
    .from('charter_comments')
    .insert({
      charter_submission_id: params.id,
      parent_id: params.commentId,
      body: body.trim(),
      author_role: isAdmin ? 'admin' : 'user',
      author_id: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
