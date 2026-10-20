import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { deleteSeasonInvite } from '@/lib/data/season-invites'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { seasonId: string; inviteId: string } },
) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  try {
    await deleteSeasonInvite(supabase, params.seasonId, params.inviteId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
