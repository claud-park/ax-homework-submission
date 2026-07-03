import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const { body: commentBody } = await req.json()
  if (!commentBody?.trim())
    return NextResponse.json({ error: 'Comment body required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('comments')
    .update({ body: commentBody.trim(), updated_at: new Date().toISOString() })
    .eq('id', params.commentId)
    .eq('submission_id', params.id)
    .eq('author_role', 'admin')
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
