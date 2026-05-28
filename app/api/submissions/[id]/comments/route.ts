import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewComment } from '@/lib/notifications'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { body: commentBody } = await req.json()
  if (!commentBody?.trim())
    return NextResponse.json({ error: 'Comment body required' }, { status: 400 })
  const supabase = createServiceClient()
  // Verify the submission belongs to this user
  const { data: submission } = await supabase
    .from('submissions')
    .select('id, homework_id, homeworks(title)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await supabase
    .from('comments')
    .insert({ submission_id: params.id, body: commentBody.trim(), author_role: 'user', author_id: user.id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
  void (async () => {
    try {
      const recipientEmail = process.env.ADMIN_NOTIFICATION_EMAIL
      if (!recipientEmail) return
      const { data: userRow } = await supabase.from('users').select('name').eq('id', user.id).single()
      if (!userRow) {
        console.warn('[email] skipped notifyNewComment: user lookup returned null', { userId: user.id })
        return
      }
      const hw = submission.homeworks as { title: string } | { title: string }[] | null
      const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
      const contextTitle = submission.homework_id != null
        ? `#${String(submission.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
        : '과제 제출'
      const link = submission.homework_id != null
        ? `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/admin/homework/${submission.homework_id}`
        : `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/admin/kanban`
      await notifyNewComment({
        recipientEmail,
        recipientName: '관리자',
        authorName: userRow.name,
        authorRole: 'user',
        contextTitle,
        body: data.body,
        isReply: false,
        link,
      })
    } catch (e) {
      console.error('[email] outer catch:', e)
    }
  })()

  return NextResponse.json(data, { status: 201 })
}
