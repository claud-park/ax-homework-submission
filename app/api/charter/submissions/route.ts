import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const homeworkId = req.nextUrl.searchParams.get('homework_id')
  const supabase = createServiceClient()
  let query = supabase
    .from('charter_submissions')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
  if (homeworkId) query = query.eq('homework_id', Number(homeworkId))
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { project_name, content, homework_id } = await req.json()
  if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .insert({ user_id: user.id, project_name, content, ...(homework_id ? { homework_id } : {}) })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
