import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()

  const { data: homeworks, error } = await supabase
    .from('homeworks')
    .select('*')
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: users } = await supabase.from('users').select('id')
  const userCount = users?.length ?? 0

  const enriched = await Promise.all(homeworks.map(async hw => {
    const { count } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('homework_id', hw.id)
      .in('status', ['pending', 'accepted', 'declined'])
    return { ...hw, submission_count: count ?? 0, user_count: userCount }
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { title, description, due_date } = body
  if (!title || !due_date)
    return NextResponse.json({ error: 'title and due_date required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .insert({ title, description, due_date })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
