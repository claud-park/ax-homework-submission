import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyMilestoneCompleted } from '@/lib/notifications'
import type { MilestoneStatus, User } from '@/lib/types'

function computeStatus(milestone: {
  due_date: string | null
  is_manual_progress: boolean
  is_manual_completed: boolean
  bottleneck_type: string | null
}): MilestoneStatus {
  if (milestone.is_manual_completed) return 'completed'
  if (milestone.bottleneck_type) return 'delayed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (milestone.due_date && new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) {
    return NextResponse.json(
      { error: 'validation_failed', fields: [{ field: 'note', message: '필수 항목입니다.' }] },
      { status: 400 },
    )
  }
  const logDate = typeof body.log_date === 'string' ? body.log_date : new Date().toISOString().slice(0, 10)
  const markInProgress = body.mark_in_progress === true
  const markCompleted = body.mark_completed === true

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('milestones')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Charter approval guard — same rule as the website's PATCH /api/milestones/[id]
  if (markInProgress && !existing.is_manual_progress) {
    const { count } = await supabase
      .from('charter_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('admin_approved_at', 'is', null)
    if (!count || count === 0) {
      return NextResponse.json({ error: 'charter_not_approved' }, { status: 403 })
    }
  }

  const { data: logEntry, error: logError } = await supabase
    .from('milestone_activity_log')
    .insert({ milestone_id: params.id, user_id: user.id, log_date: logDate, note })
    .select()
    .single()
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })

  if (!markInProgress && !markCompleted) {
    return NextResponse.json({ log: logEntry, milestone: existing })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (markInProgress) patch.is_manual_progress = true
  if (markCompleted) patch.is_manual_completed = true
  const merged = { ...existing, ...patch }
  patch.status = computeStatus(merged as Parameters<typeof computeStatus>[0])

  const { data: updated, error: updateError } = await supabase
    .from('milestones')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (markCompleted && !existing.is_manual_completed) {
    const notifUser: User = {
      id: user.id,
      email: user.email ?? '',
      name: user.user_metadata?.name ?? user.email ?? '',
      avatar_url: user.user_metadata?.avatar_url ?? null,
      created_at: user.created_at,
    }
    notifyMilestoneCompleted({ user: notifUser, milestone: updated }).catch(console.error)
  }

  return NextResponse.json({ log: logEntry, milestone: updated })
}
