import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewComment } from '@/lib/notifications'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()

  // Verify charter access
  const { data: charter } = await supabase
    .from('charter_submissions')
    .select('id, user_id')
    .eq('id', params.id)
    .single()
  if (!charter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isAdmin && charter.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Verify parent is top-level (no reply-to-reply)
  let body: string | undefined
  try {
    const json = await req.json()
    body = json.body
  } catch {
    return NextResponse.json({ error: 'Body required' }, { status: 400 })
  }
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const { data: parent } = await supabase
    .from('charter_comments')
    .select('id, parent_id')
    .eq('id', params.commentId)
    .eq('charter_submission_id', params.id)
    .single()
  if (!parent) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  if (parent.parent_id !== null) return NextResponse.json({ error: 'Cannot reply to a reply' }, { status: 400 })

  const { data, error } = await supabase
    .from('charter_comments')
    .insert({
      charter_submission_id: params.id,
      parent_id: params.commentId,
      body: body.trim(),
      author_role: isAdmin ? 'admin' : 'user',
      author_id: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
  void (async () => {
    try {
      const authorRole: 'admin' | 'user' = isAdmin ? 'admin' : 'user'
      const { data: charterRow } = await supabase
        .from('charter_submissions')
        .select('user_id, project_name, users(name, email)')
        .eq('id', params.id)
        .single()
      if (!charterRow) {
        console.warn('[email] skipped notifyNewComment: charter lookup returned null', { charterId: params.id })
        return
      }
      const champ = charterRow.users as { name: string; email: string } | { name: string; email: string }[] | null
      const champRow = Array.isArray(champ) ? champ[0] : champ
      const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000'
      const contextTitle = `과제정의서 - ${charterRow.project_name ?? champRow?.name ?? ''}`

      let recipientEmail: string | undefined
      let recipientName: string
      let authorName: string
      let link: string

      if (authorRole === 'admin') {
        if (!champRow?.email) {
          console.warn('[email] skipped notifyNewComment: champion email missing', { userId: charterRow.user_id })
          return
        }
        recipientEmail = champRow.email
        recipientName = champRow.name
        authorName = '관리자'
        link = `${appBase}/charter`
      } else {
        recipientEmail = process.env.ADMIN_NOTIFICATION_EMAIL
        if (!recipientEmail) return
        recipientName = '관리자'
        authorName = champRow?.name ?? '챔피언'
        link = `${appBase}/admin/progress`
      }

      await notifyNewComment({
        recipientEmail,
        recipientName,
        authorName,
        authorRole,
        contextTitle,
        body: data.body,
        isReply: true,
        link,
      })
    } catch (e) {
      console.error('[email] outer catch:', e)
    }
  })()

  return NextResponse.json(data, { status: 201 })
}
