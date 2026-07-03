import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const { status, review_note, support_assignee } = await req.json()
  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: req_ } = await supabase.from('deadline_change_requests').select('*').eq('id', params.id).single()
  if (!req_) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('deadline_change_requests')
    .update({ status, review_note, support_assignee, reviewed_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (status === 'approved') {
    const { data: ms } = await supabase
      .from('milestones')
      .select('is_manual_progress, is_manual_completed')
      .eq('id', req_.milestone_id)
      .single()

    const newDueDate: string | null = req_.requested_due_date
    const computedStatus = (() => {
      if (ms?.is_manual_completed) return 'completed'
      if (ms?.is_manual_progress) return 'in_progress'
      if (newDueDate && new Date(newDueDate) < new Date()) return 'delayed'
      return 'not_started'
    })()

    await supabase.from('milestones').update({
      due_date: newDueDate,
      bottleneck_type: null,
      bottleneck_note: null,
      bottleneck_admin_comment: null,
      bottleneck_reviewed_at: null,
      status: computedStatus,
    }).eq('id', req_.milestone_id)
  }

  return NextResponse.json(data)
}
