import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { requireCurrentSeasonIdForWrite } from '@/lib/data/season'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user
  const supabase = createServiceClient()

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
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user
  const body = await req.json()
  const supabase = createServiceClient()
  let seasonId: string
  try {
    seasonId = await requireCurrentSeasonIdForWrite(supabase)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('project_charters')
    .upsert(
      {
        user_id: user.id,
        season_id: seasonId,
        project_name: body.project_name,
        content: body.content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
