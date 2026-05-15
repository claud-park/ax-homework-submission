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
  const { data, error } = await supabase
    .from('charter_comments')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', params.commentId)
    .eq('author_id', user.id)
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 })
  return NextResponse.json(data)
}
