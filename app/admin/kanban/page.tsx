import { createServiceClient } from '@/lib/supabase/server'
import { KanbanClient } from './KanbanClient'
import type { KanbanCard, KanbanDataV2 } from '@/lib/types'

export default async function AdminKanbanPage() {
  const supabase = createServiceClient()

  const [
    { data: users },
    { data: allSubmissions },
    { data: milestones },
    { data: charters },
    { data: deadlineReqs },
  ] = await Promise.all([
    supabase.from('users').select('*'),
    supabase
      .from('submissions')
      .select('id, user_id, file_name, link_url, status, attempt_number, submitted_at')
      .order('submitted_at', { ascending: false }),
    supabase.from('milestones').select('user_id, status').eq('publish_status', 'published'),
    supabase.from('charter_submissions').select('user_id, admin_approved_at').eq('publish_status', 'published'),
    supabase.from('deadline_change_requests').select('user_id').eq('status', 'pending'),
  ])

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

  const charterCountMap = new Map<string, { total: number; approved: number }>()
  for (const c of charters ?? []) {
    const entry = charterCountMap.get(c.user_id) ?? { total: 0, approved: 0 }
    entry.total++
    if (c.admin_approved_at) entry.approved++
    charterCountMap.set(c.user_id, entry)
  }
  const deadlineMap = new Map<string, number>()
  for (const r of deadlineReqs ?? []) {
    deadlineMap.set(r.user_id, (deadlineMap.get(r.user_id) ?? 0) + 1)
  }

  const data: KanbanDataV2 = {
    not_started: [], in_progress: [], reviewing: [], accepted: [], declined: [],
  }

  for (const user of users ?? []) {
    const sub = latestSubMap.get(user.id) ?? null
    const ms = milestoneMap.get(user.id) ?? { total: 0, completed: 0 }
    const charterEntry = charterCountMap.get(user.id) ?? { total: 0, approved: 0 }
    const charterCount = charterEntry.total
    const approvedCharterCount = charterEntry.approved
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
            linkUrl: sub.link_url,
            submittedAt: sub.submitted_at,
          }
        : null,
      milestoneTotal: ms.total,
      milestoneCompleted: ms.completed,
      charterCount,
      approvedCharterCount,
      pendingDeadlineRequests,
    }

    if (sub?.status === 'accepted') data.accepted.push(card)
    else if (sub?.status === 'pending') data.reviewing.push(card)
    else if (sub?.status === 'declined') data.declined.push(card)
    else if (ms.total > 0 || charterCount > 0) data.in_progress.push(card)
    else data.not_started.push(card)
  }

  return <KanbanClient initialData={data} />
}
