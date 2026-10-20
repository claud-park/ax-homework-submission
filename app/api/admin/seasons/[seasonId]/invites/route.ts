import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import type { SeasonRole } from '@/lib/types'
import {
  createSeasonInvites,
  listSeasonInvites,
  normalizeInviteEmails,
  partitionInviteEmails,
} from '@/lib/data/season-invites'

export async function GET(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  const invites = await listSeasonInvites(supabase, params.seasonId)
  return NextResponse.json({ invites })
}

export async function POST(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null) as { emails?: unknown; roleInSeason?: unknown } | null
  const roleInSeason = body?.roleInSeason
  if (roleInSeason !== 'champion' && roleInSeason !== 'partner') {
    return NextResponse.json({ error: 'roleInSeason은 champion 또는 partner여야 합니다.' }, { status: 400 })
  }
  if (typeof body?.emails !== 'string') {
    return NextResponse.json({ error: 'emails는 문자열이어야 합니다.' }, { status: 400 })
  }

  const emails = normalizeInviteEmails(body.emails)
  const { valid, invalid } = partitionInviteEmails(emails, process.env.ALLOWED_EMAIL_DOMAIN)
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `형식이 잘못됐거나 허용되지 않은 도메인의 이메일이 있습니다: ${invalid.join(', ')}`, invalid },
      { status: 400 },
    )
  }
  if (valid.length === 0) {
    return NextResponse.json({ error: '등록할 이메일이 없습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    const result = await createSeasonInvites(supabase, params.seasonId, valid, roleInSeason as SeasonRole)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
