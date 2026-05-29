import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('sub_tasks')
    .select('*, milestones(*)')
    .eq('user_id', user.id)
    .order('display_order')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ milestones, ...rest }: any) => ({
    ...rest,
    milestones: milestones ?? [],
  }))
  return NextResponse.json(normalized)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description } = body

  if (!title?.trim()) {
    return NextResponse.json(
      { error: 'validation_failed', fields: [{ field: 'title', message: '필수 항목입니다.' }] },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // display_order = current max + 1
  const { count } = await supabase
    .from('sub_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { data, error } = await supabase
    .from('sub_tasks')
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim() ?? null,
      display_order: count ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, milestones: [] }, { status: 201 })
}
