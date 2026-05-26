import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewSubmission, notifyMilestoneCompleted } from '@/lib/notifications'
import type { Submission } from '@/lib/types'

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx !== -1 ? name.slice(dotIdx) : ''
  const base = dotIdx !== -1 ? name.slice(0, dotIdx) : name
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') + ext
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const supabase = createServiceClient()

  // Guard: reject deliverable uploads against draft milestones (defense-in-depth for notification gating)
  const { data: milestonePub } = await supabase
    .from('milestones')
    .select('publish_status')
    .eq('id', params.id)
    .single()
  if (!milestonePub || milestonePub.publish_status !== 'published') {
    return NextResponse.json({ error: '게시되지 않은 마일스톤에는 산출물을 업로드할 수 없습니다.' }, { status: 400 })
  }

  const { data: milestone } = await supabase
    .from('milestones')
    .select('id, week_number')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })

  // Check for existing deliverables (re-submission)
  const { data: existing } = await supabase.from('milestone_deliverables').select('id, file_path').eq('milestone_id', params.id)
  const isResubmit = (existing ?? []).length > 0

  if (isResubmit) {
    const oldPaths = (existing ?? []).map((d: { file_path: string }) => d.file_path)
    await supabase.storage.from('milestone-deliverables').remove(oldPaths)
    await supabase.from('milestone_deliverables').delete().eq('milestone_id', params.id)
  }

  const safeFileName = sanitizeFileName(file.name)
  const filePath = `${user.id}/${params.id}/${safeFileName}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('milestone-deliverables')
    .upload(filePath, arrayBuffer, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  await supabase.from('milestone_deliverables').insert({ milestone_id: params.id, file_path: filePath, file_name: file.name })
  const newStatus = isResubmit ? 'in_progress' : 'completed'
  await supabase.from('milestones').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', params.id).eq('user_id', user.id)

  // On re-submission: also create a homework submission (week_number → homework_id)
  let createdSubmission: Submission | null = null
  let resubmitHomeworkId: number | null = null
  if (isResubmit) {
    resubmitHomeworkId = milestone.week_number
    const { count } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('homework_id', resubmitHomeworkId)
    const attemptNumber = (count ?? 0) + 1
    const subFilePath = `${user.id}/${resubmitHomeworkId}/${attemptNumber}/${safeFileName}`
    await supabase.storage
      .from('submissions')
      .upload(subFilePath, arrayBuffer, { contentType: file.type, upsert: false })
    const { data: subRow } = await supabase.from('submissions').insert({
      user_id: user.id,
      homework_id: resubmitHomeworkId,
      file_path: subFilePath,
      file_name: file.name,
      status: 'pending',
      attempt_number: attemptNumber,
    }).select().single()
    createdSubmission = subRow
  }

  // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
  void (async () => {
    try {
      const { data: userRow } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (!userRow) {
        console.warn('[email] skipped milestone deliverable notification: user lookup returned null', { userId: user.id })
        return
      }
      if (isResubmit && createdSubmission) {
        await notifyNewSubmission({ user: userRow, submission: createdSubmission })
      } else if (!isResubmit) {
        const { data: milestoneFull } = await supabase.from('milestones').select('*').eq('id', params.id).single()
        if (!milestoneFull) {
          console.warn('[email] skipped notifyMilestoneCompleted: milestone lookup returned null', { milestoneId: params.id })
          return
        }
        await notifyMilestoneCompleted({ user: userRow, milestone: milestoneFull, fileName: file.name })
      }
    } catch (e) {
      console.error('[email] outer catch:', e)
    }
  })()

  return NextResponse.json({ ok: true }, { status: 201 })
}
