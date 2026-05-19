import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyDeadlineChangeRequest } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { milestone_id, requested_due_date, reason } = await req.json()
  if (!milestone_id || !requested_due_date || !reason)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: ms } = await supabase.from('milestones').select('*').eq('id', milestone_id).eq('user_id', user.id).single()
  if (!ms) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('deadline_change_requests')
    .insert({ milestone_id, user_id: user.id, original_due_date: ms.due_date, requested_due_date, reason })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
  void (async () => {
    try {
      const { data: userRow } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (userRow) {
        await notifyDeadlineChangeRequest({ user: userRow, milestone: ms, request: data })
      } else {
        console.warn('[email] skipped notifyDeadlineChangeRequest: user lookup returned null', { userId: user.id })
      }
    } catch (e) {
      console.error('[email] outer catch:', e)
    }
  })()

  return NextResponse.json(data, { status: 201 })
}
