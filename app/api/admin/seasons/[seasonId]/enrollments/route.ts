import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { assignEnrollments, type EnrollmentAssignment } from '@/lib/data/seasons-admin'

export async function POST(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { assignments } = await req.json() as { assignments: EnrollmentAssignment[] }
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return NextResponse.json({ error: 'assignments가 비어 있습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    await assignEnrollments(supabase, params.seasonId, assignments)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
