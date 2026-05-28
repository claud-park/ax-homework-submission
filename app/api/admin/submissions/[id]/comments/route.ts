import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewComment } from '@/lib/notifications'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { body: commentBody } = await req.json()
  if (!commentBody?.trim())
    return NextResponse.json({ error: 'Comment body required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('comments')
    .insert({ submission_id: params.id, body: commentBody.trim(), author_role: 'admin' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
  void (async () => {
    try {
      const { data: subRow } = await supabase
        .from('submissions')
        .select('user_id, homework_id, homeworks(title), users(name, email)')
        .eq('id', params.id)
        .single()
      if (!subRow) {
        console.warn('[email] skipped notifyNewComment: submission lookup returned null', { submissionId: params.id })
        return
      }
      const champ = subRow.users as { name: string; email: string } | { name: string; email: string }[] | null
      const champRow = Array.isArray(champ) ? champ[0] : champ
      if (!champRow?.email) {
        console.warn('[email] skipped notifyNewComment: champion email missing', { userId: subRow.user_id })
        return
      }
      const hw = subRow.homeworks as { title: string } | { title: string }[] | null
      const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
      const contextTitle = subRow.homework_id != null
        ? `#${String(subRow.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
        : '과제 제출'
      const link = subRow.homework_id != null
        ? `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/homework/${subRow.homework_id}`
        : `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/my-project/submission`
      await notifyNewComment({
        recipientEmail: champRow.email,
        recipientName: champRow.name,
        authorName: '관리자',
        authorRole: 'admin',
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
