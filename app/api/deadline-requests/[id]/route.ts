import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user
  const { requested_due_date, reason } = await req.json()
  if (!requested_due_date || !reason)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .update({ requested_due_date, reason, status: 'pending', reviewed_at: null, review_note: null })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
