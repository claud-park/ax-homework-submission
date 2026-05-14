import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*, milestone_deliverables(*)')
    .eq('user_id', user.id)
    .order('week_number').order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { week_number, title, start_date, due_date, description } = body
  if (!week_number || !title || !start_date || !due_date)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({ user_id: user.id, week_number, title, start_date, due_date, description })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
