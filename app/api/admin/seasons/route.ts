import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { listSeasons, createSeason } from '@/lib/data/seasons-admin'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const supabase = createServiceClient()
  const seasons = await listSeasons(supabase)
  return NextResponse.json(seasons)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { name, startDate } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: '시즌 이름은 필수입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    const season = await createSeason(supabase, { name: name.trim(), startDate: startDate ?? null })
    return NextResponse.json(season, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
