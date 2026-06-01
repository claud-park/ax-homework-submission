import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

async function syncParentDates(
  supabase: ReturnType<typeof createServiceClient>,
  parentId: string,
  userId: string,
) {
  const { data: children } = await supabase
    .from('milestones').select('start_date, due_date')
    .eq('parent_milestone_id', parentId).eq('user_id', userId)
  if (!children) return null
  const startDates = children.map((c: { start_date: string | null }) => c.start_date).filter(Boolean).sort() as string[]
  const dueDates = children.map((c: { due_date: string | null }) => c.due_date).filter(Boolean).sort() as string[]
  const { data: parent } = await supabase
    .from('milestones')
    .update({ start_date: startDates[0] ?? null, due_date: dueDates[dueDates.length - 1] ?? null, updated_at: new Date().toISOString() })
    .eq('id', parentId).eq('user_id', userId).select().single()
  return parent ?? null
}

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()
  let query = supabase
    .from('milestones')
    .select('*')
    .eq('user_id', effectiveUserId)
    .order('display_order')
    .order('start_date', { ascending: true, nullsFirst: false })

  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { title, start_date, due_date, description, publish_status, parent_milestone_id } = body
  const status = publish_status === 'published' ? 'published' : 'draft'

  if (status === 'published' && !title) {
    return NextResponse.json(
      { error: 'validation_failed', fields: [{ field: 'title', message: '필수 항목입니다.' }] },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      user_id: user.id,
      title: title ?? '',
      start_date: start_date ?? null,
      due_date: due_date ?? null,
      description: description ?? null,
      publish_status: status,
      parent_milestone_id: parent_milestone_id ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const parentUpdated = parent_milestone_id
    ? await syncParentDates(supabase, parent_milestone_id, user.id)
    : null
  return NextResponse.json({ milestone: data, parentUpdated }, { status: 201 })
}
