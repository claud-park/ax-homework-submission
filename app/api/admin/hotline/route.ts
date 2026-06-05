import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { HotlineThread } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('champion_user_id, sender_role, body, created_at, read_by_admin, users!champion_user_id(name)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // champion_user_id 별로 그룹핑 (첫 번째 레코드 = 가장 최근)
  const threadMap = new Map<string, HotlineThread>()
  for (const row of (data ?? [])) {
    const userId = row.champion_user_id as string
    if (!threadMap.has(userId)) {
      const userRow = row.users as unknown as { name: string } | null
      threadMap.set(userId, {
        champion_user_id: userId,
        champion_name: userRow?.name ?? userId,
        last_message: row.body as string,
        last_message_at: row.created_at as string,
        last_sender_role: row.sender_role as 'champion' | 'admin',
        unread_count: 0,
      })
    }
    // champion이 보낸 메시지 중 admin이 아직 안 읽은 것 카운트
    if (row.sender_role === 'champion' && !row.read_by_admin) {
      const thread = threadMap.get(userId)!
      thread.unread_count += 1
    }
  }

  const threads = Array.from(threadMap.values())
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())

  return NextResponse.json(threads)
}
