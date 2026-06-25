import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'
import { allowedSessionUpdateFields } from '@/lib/sessions/permissions'

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
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const role = await resolveSessionRole(supabase, params.sessionId, user)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedSessionUpdateFields(role)) {
    if (key in body) updates[key] = body[key]
  }

  let query = supabase
    .from('check_up_sessions')
    .update(updates)
    .eq('id', params.sessionId)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)

  const { data, error } = await query.select()
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  if (!data || data.length === 0) {
    if (expectedUpdatedAt) {
      return NextResponse.json(
        { error: '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  return NextResponse.json(data[0])
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
