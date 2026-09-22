import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { activateSeason } from '@/lib/data/seasons-admin'

export async function POST(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  try {
    await activateSeason(supabase, params.seasonId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
