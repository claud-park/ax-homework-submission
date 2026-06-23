import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const isAdmin = !!user.user_metadata?.is_admin

  const { data: session, error } = await supabase
    .from('check_up_sessions')
    .select('*')
    .eq('id', params.sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Champion can only access own session
  if (!isAdmin && (session as Record<string, unknown>).champion_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const championUserId = (session as Record<string, unknown>).champion_user_id as string

  // Fetch related data in parallel
  const [actionItemsResult, commentsResult, milestonesResult] = await Promise.all([
    supabase
      .from('session_action_items')
      .select('*')
      .eq('session_id', params.sessionId)
      .order('display_order', { ascending: true }),
    supabase
      .from('session_comments')
      .select('*, author:users(id,name,email)')
      .eq('session_id', params.sessionId),
    supabase
      .from('milestones')
      .select('*')
      .eq('user_id', championUserId)
      .eq('publish_status', 'published'),
  ])

  return NextResponse.json({
    ...session,
    action_items: actionItemsResult.data ?? [],
    comments: commentsResult.data ?? [],
    milestones: milestonesResult.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const allowed = ['title', 'notes', 'session_date'] as const
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('check_up_sessions')
    .update(updates)
    .eq('id', params.sessionId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('check_up_sessions')
    .delete()
    .eq('id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
