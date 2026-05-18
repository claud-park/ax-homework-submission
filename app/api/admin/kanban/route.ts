import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { KanbanCard, KanbanDataV2 } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const homeworkIdParam = searchParams.get('homework_id')
  if (homeworkIdParam !== null && isNaN(parseInt(homeworkIdParam, 10))) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const homeworkId = homeworkIdParam ? parseInt(homeworkIdParam, 10) : null

  const supabase = createServiceClient()

  // 1. Users
  const { data: users, error: usersErr } = await supabase.from('users').select('*')
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

  // 2. Homeworks
  let hwQuery = supabase.from('homeworks').select('id, title')
  if (homeworkId !== null) hwQuery = hwQuery.eq('id', homeworkId)
  const { data: homeworks, error: hwErr } = await hwQuery
  if (hwErr) return NextResponse.json({ error: hwErr.message }, { status: 500 })

  // 3. Latest submission per (user_id, homework_id)
  let subQuery = supabase
    .from('submissions')
    .select('id, user_id, homework_id, file_name, status, attempt_number, submitted_at')
    .order('submitted_at', { ascending: false })
  if (homeworkId !== null) subQuery = subQuery.eq('homework_id', homeworkId)
  const { data: allSubmissions, error: subErr } = await subQuery
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

  const latestSubMap = new Map<string, NonNullable<typeof allSubmissions>[number]>()
  for (const sub of allSubmissions ?? []) {
    const key = `${sub.user_id}_${sub.homework_id}`
    if (!latestSubMap.has(key)) latestSubMap.set(key, sub)
  }

  // 4. Milestone counts per (user_id, homework_id)
  let msQuery = supabase.from('milestones').select('user_id, homework_id, status')
  if (homeworkId !== null) msQuery = msQuery.eq('homework_id', homeworkId)
  const { data: milestones, error: msErr } = await msQuery
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })

  const milestoneMap = new Map<string, { total: number; completed: number }>()
  for (const m of milestones ?? []) {
    if (m.homework_id === null) continue
    const key = `${m.user_id}_${m.homework_id}`
    const entry = milestoneMap.get(key) ?? { total: 0, completed: 0 }
    entry.total++
    if (m.status === 'completed') entry.completed++
    milestoneMap.set(key, entry)
  }

  // 5. Charter existence per (user_id, homework_id)
  let charterQuery = supabase.from('charter_submissions').select('user_id, homework_id')
  if (homeworkId !== null) charterQuery = charterQuery.eq('homework_id', homeworkId)
  const { data: charters, error: charterErr } = await charterQuery
  if (charterErr) return NextResponse.json({ error: charterErr.message }, { status: 500 })

  const charterSet = new Set<string>()
  for (const c of charters ?? []) {
    if (c.homework_id !== null) charterSet.add(`${c.user_id}_${c.homework_id}`)
  }

  // 6. Pending deadline requests per (user_id, homework_id) via milestone join
  const { data: deadlineReqs, error: dlErr } = await supabase
    .from('deadline_change_requests')
    .select('user_id, milestones(homework_id)')
    .eq('status', 'pending')
  if (dlErr) return NextResponse.json({ error: dlErr.message }, { status: 500 })

  const deadlineMap = new Map<string, number>()
  for (const req of deadlineReqs ?? []) {
    const milestoneJoin = req.milestones as { homework_id: number | null } | { homework_id: number | null }[] | null
    const hwId = Array.isArray(milestoneJoin) ? milestoneJoin[0]?.homework_id : milestoneJoin?.homework_id
    if (!hwId) continue
    const key = `${req.user_id}_${hwId}`
    deadlineMap.set(key, (deadlineMap.get(key) ?? 0) + 1)
  }

  // Build KanbanCard[] for every user × homework pair
  const result: KanbanDataV2 = {
    not_started: [],
    in_progress: [],
    reviewing: [],
    accepted: [],
    declined: [],
  }

  for (const hw of homeworks ?? []) {
    for (const user of users ?? []) {
      const key = `${user.id}_${hw.id}`
      const sub = latestSubMap.get(key) ?? null
      const ms = milestoneMap.get(key) ?? { total: 0, completed: 0 }
      const hasCharter = charterSet.has(key)
      const pendingDeadlineRequests = deadlineMap.get(key) ?? 0

      const card: KanbanCard = {
        userId: user.id,
        homeworkId: hw.id,
        homeworkTitle: hw.title,
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
  }

  return NextResponse.json(result)
}
