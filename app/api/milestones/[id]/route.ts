import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function computeStatus(milestone: { due_date: string; is_manual_progress: boolean }, hasDeliverable: boolean) {
  if (hasDeliverable) return 'completed'
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
    if (!eff.week_number) fields.push({ field: 'week_number', message: '필수 항목입니다.' })
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

  const { data, error } = await supabase
    .from('milestones')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
