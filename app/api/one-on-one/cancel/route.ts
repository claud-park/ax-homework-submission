import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { slack } from '@/lib/one-on-one/slack'
import { formatSlotLabel } from '@/lib/one-on-one/slot-utils'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const { bookingId } = await req.json() as { bookingId: string }

  const supabase = createServiceClient()

  // 본인 + pending 상태 확인 후 취소 (원자적)
  const { data: updated } = await supabase
    .from('one_on_one_bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('champion_user_id', user.id)  // 본인 것만
    .eq('status', 'pending')
    .select('slack_ts, slack_channel, champion_name, slot_start, duration_minutes')

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: '취소할 수 없는 신청입니다.' }, { status: 409 })
  }

  const b = updated[0]
  if (b.slack_ts && b.slack_channel) {
    const label = formatSlotLabel(b.slot_start)
    try {
      await slack.chat.update({
        channel: b.slack_channel,
        ts: b.slack_ts,
        text: `🚫 챔피언이 취소함 — ${b.champion_name} ${label} (${b.duration_minutes}분)`,
        blocks: [],
      })
    } catch { /* Slack update failure should not block the cancel response */ }
  }

  return NextResponse.json({ ok: true })
}
