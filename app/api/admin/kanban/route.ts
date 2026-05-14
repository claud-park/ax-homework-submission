import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const homeworkId = searchParams.get('homework_id')
  if (homeworkId !== null && isNaN(parseInt(homeworkId, 10))) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let query = supabase.from('submissions').select('*, users(*)').order('submitted_at', { ascending: false })
  if (homeworkId) query = query.eq('homework_id', parseInt(homeworkId, 10))

  const { data: submissions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: allUsers } = await supabase.from('users').select('*')
  const submittedUserIds = new Set((submissions ?? []).map((s: { user_id: string }) => s.user_id))
  const notSubmitted = (allUsers ?? []).filter((u: { id: string }) => !submittedUserIds.has(u.id))

  return NextResponse.json({
    pending: (submissions ?? []).filter((s: { status: string }) => s.status === 'pending'),
    accepted: (submissions ?? []).filter((s: { status: string }) => s.status === 'accepted'),
    declined: (submissions ?? []).filter((s: { status: string }) => s.status === 'declined'),
    not_submitted: homeworkId ? notSubmitted : [],
  })
}
