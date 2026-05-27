import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()
  let query = supabase
    .from('milestones')
    .select('*, milestone_deliverables(*)')
    .eq('user_id', effectiveUserId)
    .order('week_number')
    .order('display_order')

  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ milestone_deliverables, ...rest }: any) => ({
    ...rest,
    deliverables: milestone_deliverables,
  }))
  return NextResponse.json(normalized)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { week_number, title, start_date, due_date, description, publish_status } = body
  const status = publish_status === 'published' ? 'published' : 'draft'
  const resolvedWeekNumber = week_number ?? 1

  if (status === 'published') {
    const fields: { field: string; message: string }[] = []
    if (!title) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!start_date) fields.push({ field: 'start_date', message: '필수 항목입니다.' })
    if (!due_date) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (!resolvedWeekNumber) fields.push({ field: 'week_number', message: '필수 항목입니다.' })
    if (fields.length > 0) return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      user_id: user.id,
      week_number: resolvedWeekNumber,
      title: title ?? '',
      start_date: start_date ?? null,
      due_date: due_date ?? null,
      description: description ?? null,
      publish_status: status,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
