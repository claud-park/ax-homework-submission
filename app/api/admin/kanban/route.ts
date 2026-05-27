import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { KanbanCard, KanbanDataV2 } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: allSubmissions, error: subErr },
    { data: milestones, error: msErr },
    { data: charters, error: charterErr },
    { data: deadlineReqs, error: dlErr },
  ] = await Promise.all([
    supabase.from('users').select('*'),
    supabase
      .from('submissions')
      .select('id, user_id, file_name, status, attempt_number, submitted_at')
      .order('submitted_at', { ascending: false }),
    supabase.from('milestones').select('user_id, status').eq('publish_status', 'published'),
    supabase.from('charter_submissions').select('user_id').eq('publish_status', 'published'),
    supabase.from('deadline_change_requests').select('user_id').eq('status', 'pending'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })
  if (charterErr) return NextResponse.json({ error: charterErr.message }, { status: 500 })
  if (dlErr) return NextResponse.json({ error: dlErr.message }, { status: 500 })

  const latestSubMap = new Map<string, NonNullable<typeof allSubmissions>[number]>()
  for (const sub of allSubmissions ?? []) {
    if (!latestSubMap.has(sub.user_id)) latestSubMap.set(sub.user_id, sub)
  }

  const milestoneMap = new Map<string, { total: number; completed: number }>()
  for (const m of milestones ?? []) {
    const entry = milestoneMap.get(m.user_id) ?? { total: 0, completed: 0 }
    entry.total++
    if (m.status === 'completed') entry.completed++
    milestoneMap.set(m.user_id, entry)
  }

  const charterSet = new Set<string>((charters ?? []).map(c => c.user_id))
  const deadlineMap = new Map<string, number>()
  for (const r of deadlineReqs ?? []) {
    deadlineMap.set(r.user_id, (deadlineMap.get(r.user_id) ?? 0) + 1)
  }

  const result: KanbanDataV2 = {
    not_started: [], in_progress: [], reviewing: [], accepted: [], declined: [],
  }

  for (const user of users ?? []) {
    const sub = latestSubMap.get(user.id) ?? null
    const ms = milestoneMap.get(user.id) ?? { total: 0, completed: 0 }
    const hasCharter = charterSet.has(user.id)
    const pendingDeadlineRequests = deadlineMap.get(user.id) ?? 0

    const card: KanbanCard = {
      userId: user.id,
      user,
      latestSubmission: sub
        ? {
            id: sub.id,
            status: sub.status,
            attemptNumber: sub.attempt_number,
            fileName: sub.file_name,
            submittedAt: sub.submitted_at,
          }
        : null,
      milestoneTotal: ms.total,
      milestoneCompleted: ms.completed,
      hasCharter,
      pendingDeadlineRequests,
    }

    if (sub?.status === 'accepted') result.accepted.push(card)
    else if (sub?.status === 'pending') result.reviewing.push(card)
    else if (sub?.status === 'declined') result.declined.push(card)
    else if (ms.total > 0 || hasCharter) result.in_progress.push(card)
    else result.not_started.push(card)
  }

  return NextResponse.json(result)
}
