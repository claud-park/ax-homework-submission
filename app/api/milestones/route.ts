import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const homeworkId = req.nextUrl.searchParams.get('homework_id')
  const supabase = createServiceClient()
  let query = supabase
    .from('milestones')
    .select('*, milestone_deliverables(*)')
    .eq('user_id', user.id)
    .order('display_order')
  if (homeworkId) {
    query = query.eq('homework_id', Number(homeworkId))
  } else {
    query = query.order('week_number')
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ milestone_deliverables, ...rest }: any) => ({ ...rest, deliverables: milestone_deliverables }))
  return NextResponse.json(normalized)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { week_number, homework_id, title, start_date, due_date, description } = body
  // week_number defaults to homework_id when creating from homework context
  const resolvedWeekNumber = week_number ?? homework_id ?? 1
  if (!title || !start_date || !due_date)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({ user_id: user.id, week_number: resolvedWeekNumber, homework_id: homework_id ?? null, title, start_date, due_date, description })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
