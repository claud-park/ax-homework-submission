import { NextRequest, NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'
import { allowedSessionUpdateFields } from '@/lib/sessions/permissions'
import { listStoredChunkPaths } from '@/lib/sessions/storedAudio'
import { requireUser, requireAdmin } from '@/lib/api/guard'

type Params = { params: { sessionId: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const isAdmin = isAdminUser(user)

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
      .eq('season_id', session.season_id) // 세션이 속한 시즌의 마일스톤만
      .eq('publish_status', 'published'),
  ])

  // 업로드는 끝났지만 /process 전에 끊긴 세션 감지용(Admin 전용, audio_file_path 가 빈 경우만 Storage 조회).
  const storedAudioChunkCount =
    isAdmin && !(session as Record<string, unknown>).audio_file_path
      ? (await listStoredChunkPaths(supabase, params.sessionId)).length
      : 0

  return NextResponse.json({
    ...session,
    stored_audio_chunk_count: storedAudioChunkCount,
    action_items: actionItemsResult.data ?? [],
    comments: commentsResult.data ?? [],
    milestones: milestonesResult.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

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
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('check_up_sessions')
    .delete()
    .eq('id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
