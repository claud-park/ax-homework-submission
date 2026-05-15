import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { is_resolved } = await req.json()
  if (typeof is_resolved !== 'boolean') {
    return NextResponse.json({ error: 'is_resolved boolean required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_comments')
    .update({
      is_resolved,
      resolved_by: is_resolved ? admin.id : null,
      resolved_at: is_resolved ? new Date().toISOString() : null,
    })
    .eq('id', params.commentId)
    .is('parent_id', null)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Not found or not a top-level comment' },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}
