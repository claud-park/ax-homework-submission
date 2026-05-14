import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { body: commentBody } = await req.json()
  if (!commentBody?.trim())
    return NextResponse.json({ error: 'Comment body required' }, { status: 400 })
  const supabase = createServiceClient()
  // Verify the submission belongs to this user
  const { data: submission } = await supabase
    .from('submissions')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await supabase
    .from('comments')
    .insert({ submission_id: params.id, body: commentBody.trim(), author_role: 'user', author_id: user.id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
