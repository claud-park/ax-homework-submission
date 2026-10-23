import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import {
  RECAP_CHANNEL_MIGRATION_MESSAGE,
  isMissingColumnError,
  parseRecapChannelId,
} from '@/lib/recap/channelId'

/** 챔피언의 recap Slack 채널 ID를 저장하거나(channelId: string) 지운다(null·빈 문자열). */
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없어요' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || !('channelId' in body)) {
    return NextResponse.json({ error: 'channelId 값이 필요해요' }, { status: 400 })
  }
  const parsed = parseRecapChannelId((body as { channelId: unknown }).channelId)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .update({ recap_slack_channel_id: parsed.channelId })
    .eq('id', params.userId)
    .select('id, recap_slack_channel_id')
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      console.error('[recap-channel] users.recap_slack_channel_id column missing:', error.message)
      return NextResponse.json({ error: RECAP_CHANNEL_MIGRATION_MESSAGE }, { status: 503 })
    }
    // uuid가 아닌 userId(22P02)는 없는 사용자로 본다.
    if (error.code === '22P02') return NextResponse.json({ error: '사용자를 찾을 수 없어요' }, { status: 404 })
    if (error.code === '23514') {
      return NextResponse.json({ error: '채널 ID 형식이 올바르지 않아요' }, { status: 400 })
    }
    console.error('[recap-channel] update failed:', error.message)
    return NextResponse.json({ error: '채널 ID를 저장하지 못했어요' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: '사용자를 찾을 수 없어요' }, { status: 404 })

  return NextResponse.json({ ok: true, channelId: parsed.channelId })
}
