import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { slack } from '@/lib/one-on-one/slack'
import { formatSlotLabel, isWorkingHour, overlapsLunchBreak } from '@/lib/one-on-one/slot-utils'
import type { OneOnOneBooking } from '@/lib/types'

function buildBlocks(bookingId: string, text: string) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ 확정' },
          style: 'primary',
          action_id: 'confirm_1on1',
          value: bookingId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ 취소' },
          style: 'danger',
          action_id: 'cancel_1on1',
          value: bookingId,
        },
      ],
    },
  ]
}

export async function POST(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { duration, slotStart, slotEnd, availableAdmins } = await req.json() as {
    duration: 30 | 60
    slotStart: string
    slotEnd: string
    availableAdmins: string[]
  }

  const supabase = createServiceClient()

  // Server-side slot validation
  const startMs = new Date(slotStart).getTime()
  const endMs   = new Date(slotEnd).getTime()

  // 1. Must be in the future
  if (startMs <= Date.now()) {
    return NextResponse.json({ error: '과거 시간은 선택할 수 없습니다.' }, { status: 400 })
  }
  // 2. duration must match slot length
  if (endMs - startMs !== duration * 60 * 1000) {
    return NextResponse.json({ error: '잘못된 슬롯 길이입니다.' }, { status: 400 })
  }
  // 3. Working hours and lunch break check
  if (!isWorkingHour(slotStart) || overlapsLunchBreak(slotStart, slotEnd)) {
    return NextResponse.json({ error: '업무 시간 외 슬롯입니다.' }, { status: 400 })
  }

  // 중복 신청 방지
  const { data: existing } = await supabase
    .from('one_on_one_bookings')
    .select('id')
    .eq('champion_user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: '이미 대기 중인 신청이 있습니다.' }, { status: 409 })
  }

  // Champion 프로필 조회
  const { data: profile } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const channelId = process.env.ONE_ON_ONE_CHANNEL_ID!
  const slotLabel = formatSlotLabel(slotStart)
  const messageText = `📅 *1-on-1 신청*\n신청자: ${profile.name} (${profile.email})\n일시: ${slotLabel} (${duration}분)\n가능 어드민: ${availableAdmins.join(', ')}`

  // 1. Slack 메시지 전송 (버튼 value는 booking.id 확정 후 업데이트 예정)
  const slackRes = await slack.chat.postMessage({
    channel: channelId,
    text: messageText,
    blocks: buildBlocks('pending', messageText), // 임시 value
  })
  const slackTs = slackRes.ts!

  // 2. DB insert
  const { data: booking, error: insertError } = await supabase
    .from('one_on_one_bookings')
    .insert({
      champion_user_id: user.id,
      champion_name:    profile.name,
      champion_email:   profile.email,
      duration_minutes: duration,
      slot_start:       slotStart,
      slot_end:         slotEnd,
      available_admins: availableAdmins,
      slack_ts:         slackTs,
      slack_channel:    channelId,
    })
    .select()
    .single()

  if (insertError || !booking) {
    // Compensate: delete the orphaned Slack message
    await slack.chat.delete({ channel: channelId, ts: slackTs }).catch(() => {})
    // Unique index violation = concurrent duplicate booking
    if (insertError?.code === '23505') {
      return NextResponse.json({ error: '이미 대기 중인 신청이 있습니다.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  }

  // 3. Slack 버튼 value에 booking.id 업데이트
  await slack.chat.update({
    channel: channelId,
    ts: slackTs,
    text: messageText,
    blocks: buildBlocks((booking as OneOnOneBooking).id, messageText),
  })

  return NextResponse.json({ booking })
}
