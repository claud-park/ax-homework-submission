import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()

  // Admin sees: all published + own drafts.
  const { data: homeworks, error } = await supabase
    .from('homeworks')
    .select('*')
    .or(`publish_status.eq.published,and(publish_status.eq.draft,created_by.eq.${admin.id})`)
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: users } = await supabase.from('users').select('id')
  const userCount = users?.length ?? 0

  const enriched = await Promise.all(homeworks.map(async hw => {
    // Drafts have no submissions; skip the count query.
    if (hw.publish_status === 'draft') {
      return { ...hw, submission_count: 0, user_count: userCount }
    }
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
  const { title, description, due_date, publish_status } = body
  const status = publish_status === 'draft' ? 'draft' : 'published'

  if (status === 'published') {
    const fields: { field: string; message: string }[] = []
    if (!title) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!due_date) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .insert({
      title: title ?? '',
      description: description ?? null,
      due_date: due_date ?? null,
      publish_status: status,
      created_by: admin.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
