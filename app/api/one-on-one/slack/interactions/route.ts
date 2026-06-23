import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/server'
import { slack, getAdminIdBySlackUserId, type AdminId } from '@/lib/one-on-one/slack'
import { getAuthenticatedClient } from '@/lib/one-on-one/google-auth'
import { formatSlotLabel } from '@/lib/one-on-one/slot-utils'

function verifySlackSignature(
  secret: string,
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const base = `v0:${timestamp}:${body}`
  const hash = createHmac('sha256', secret).update(base).digest('hex')
  const sigBuf = Buffer.from(signature)
  const hashBuf = Buffer.from(`v0=${hash}`)
  if (sigBuf.length !== hashBuf.length) return false
  return timingSafeEqual(sigBuf, hashBuf)
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? ''
  const signature = req.headers.get('x-slack-signature') ?? ''

  if (!verifySlackSignature(
    process.env.SLACK_SIGNING_SECRET!,
    body,
    timestamp,
    signature
  )) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(new URLSearchParams(body).get('payload')!)
  const action = payload.actions?.[0]
  const actionId: string = action?.action_id ?? ''
  const bookingId: string = action?.value ?? ''

  if (actionId === 'confirm_1on1') {
    await handleConfirm(payload, bookingId)
  } else if (actionId === 'cancel_1on1') {
    await handleAdminCancel(payload, bookingId)
  }

  // Slack은 3초 내 200 응답 필요
  return NextResponse.json({})
}

async function handleConfirm(payload: Record<string, unknown>, bookingId: string) {
  const supabase = createServiceClient()
  const clickerSlackId = (payload.user as { id: string }).id

  // 현재 pending 상태 확인
  const { data: booking } = await supabase
    .from('one_on_one_bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('status', 'pending')
    .single()
  if (!booking) return

  const confirmedAdminId: AdminId =
    getAdminIdBySlackUserId(clickerSlackId) ?? (booking.available_admins[0] as AdminId)
  if (!confirmedAdminId) return

  // Race condition 방지: pending → confirmed 원자적 업데이트
  const { data: updated } = await supabase
    .from('one_on_one_bookings')
    .update({
      status:       'confirmed',
      confirmed_by: confirmedAdminId,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('status', 'pending')  // 선착순
    .select('id')
  if (!updated || updated.length === 0) return  // 다른 어드민이 이미 확정

  // Google Calendar 이벤트 생성
  try {
    const auth = await getAuthenticatedClient(confirmedAdminId)
    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `1-on-1: ${booking.champion_name} × ${confirmedAdminId.toUpperCase()}`,
        start: { dateTime: booking.slot_start, timeZone: 'Asia/Seoul' },
        end:   { dateTime: booking.slot_end,   timeZone: 'Asia/Seoul' },
        attendees: [{ email: booking.champion_email }],
      },
    })
  } catch (err) {
    console.error('Calendar event creation failed:', err)
    // Calendar 실패해도 confirmed 상태는 유지 (Slack 메시지는 업데이트)
  }

  // Slack 메시지 업데이트 (버튼 제거)
  const slotLabel = formatSlotLabel(booking.slot_start)
  await slack.chat.update({
    channel: booking.slack_channel!,
    ts:      booking.slack_ts!,
    text:    `✅ 확정 (${confirmedAdminId.toUpperCase()}) — ${booking.champion_name} ${slotLabel} (${booking.duration_minutes}분)`,
    blocks:  [],
  })
}

async function handleAdminCancel(payload: Record<string, unknown>, bookingId: string) {
  const supabase = createServiceClient()
  const { data: updated } = await supabase
    .from('one_on_one_bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select('slack_ts, slack_channel, champion_name, slot_start, duration_minutes')
  if (!updated || updated.length === 0) return

  const b = updated[0]
  const slotLabel = formatSlotLabel(b.slot_start)
  await slack.chat.update({
    channel: b.slack_channel,
    ts:      b.slack_ts,
    text:    `❌ 취소됨 — ${b.champion_name} ${slotLabel} (${b.duration_minutes}분)`,
    blocks:  [],
  })
}
