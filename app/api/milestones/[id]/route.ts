import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyMilestoneCompleted, notifyBottleneck } from '@/lib/notifications'
import type { MilestoneStatus, User } from '@/lib/types'

function computeStatus(
  milestone: {
    due_date: string
    is_manual_progress: boolean
    is_manual_completed: boolean
    bottleneck_type: string | null
  },
  hasDeliverable: boolean,
): MilestoneStatus {
  if (hasDeliverable || milestone.is_manual_completed) return 'completed'
  if (milestone.bottleneck_type) return 'delayed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (milestone.due_date && new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('milestones').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Charter approval guard — block is_manual_progress unless champion has an approved charter
  if (body.is_manual_progress === true && !existing.is_manual_progress) {
    const { count } = await supabase
      .from('charter_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('admin_approved_at', 'is', null)
    if (!count || count === 0) {
      return NextResponse.json({ error: 'charter_not_approved' }, { status: 403 })
    }
  }

  // Status transition guard
  if (existing.publish_status === 'published' && body.publish_status === 'draft') {
    return NextResponse.json(
      { error: 'invalid_transition', message: 'Cannot revert published item to draft' },
      { status: 400 }
    )
  }
  const nextStatus: 'draft' | 'published' =
    body.publish_status === 'published' || existing.publish_status === 'published'
      ? 'published'
      : (body.publish_status === 'draft' ? 'draft' : existing.publish_status)

  if (nextStatus === 'published') {
    const eff = { ...existing, ...body }
    const fields: { field: string; message: string }[] = []
    if (!eff.title) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!eff.start_date) fields.push({ field: 'start_date', message: '필수 항목입니다.' })
    if (!eff.due_date) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const { count: deliverableCount } = await supabase
    .from('milestone_deliverables')
    .select('*', { count: 'exact', head: true })
    .eq('milestone_id', params.id)

  const merged = { ...existing, ...body }
  // Compute milestone progress status only for published rows
  const computedStatus = nextStatus === 'published'
    ? computeStatus(merged, (deliverableCount ?? 0) > 0)
    : existing.status

  const patch: Record<string, unknown> = {
    ...body,
    publish_status: nextStatus,
    status: computedStatus,
    updated_at: new Date().toISOString(),
  }
  delete (patch as { publish_status?: unknown }).publish_status
  patch.publish_status = nextStatus

  // sub_task_id 재배치 허용 — 명시적으로 null 전달하면 최상위로 이동
  if ('sub_task_id' in body) {
    patch.sub_task_id = body.sub_task_id ?? null
  }

  // Reset admin review when champion re-files a delay report
  if (body.bottleneck_type != null) {
    patch.bottleneck_admin_comment = null
    patch.bottleneck_reviewed_at = null
  }

  const { data, error } = await supabase
    .from('milestones')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fire-and-forget notifications
  const notifUser: User = {
    id: user.id,
    email: user.email ?? '',
    name: user.user_metadata?.name ?? user.email ?? '',
    avatar_url: user.user_metadata?.avatar_url ?? null,
    created_at: user.created_at,
  }
  if (body.is_manual_completed === true && !existing.is_manual_completed) {
    notifyMilestoneCompleted({ user: notifUser, milestone: data }).catch(console.error)
  }
  if (body.bottleneck_type != null && existing.bottleneck_type == null) {
    notifyBottleneck({ user: notifUser, milestone: data, type: body.bottleneck_type, note: body.bottleneck_note ?? null }).catch(console.error)
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('milestones').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
