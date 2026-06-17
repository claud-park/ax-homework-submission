import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const charter_id = req.nextUrl.searchParams.get('charter_id')
  const supabase = createServiceClient()

  if (charter_id) {
    // charter별 draft 조회
    const { data } = await supabase
      .from('project_charters')
      .select('*')
      .eq('charter_submission_id', charter_id)
      .single()
    return NextResponse.json(data ?? null)
  }

  // 하위 호환: charter_id 없으면 user_id 기준 최신 draft
  const { data } = await supabase
    .from('project_charters')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return NextResponse.json(data ?? null)
}

export async function PUT(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const charter_id = req.nextUrl.searchParams.get('charter_id')
  const body = await req.json()
  const supabase = createServiceClient()

  if (charter_id) {
    // charter별 draft upsert (charter_submission_id unique index 활용)
    const { data, error } = await supabase
      .from('project_charters')
      .upsert(
        {
          user_id: user.id,
          charter_submission_id: charter_id,
          project_name: body.project_name,
          content: body.content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'charter_submission_id' }
      )
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // 하위 호환: charter_id 없으면 user_id 기준 upsert
  const { data, error } = await supabase
    .from('project_charters')
    .upsert(
      { user_id: user.id, project_name: body.project_name, content: body.content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
