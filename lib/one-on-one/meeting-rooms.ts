import { google } from 'googleapis'
import type { OAuth2Client } from 'googleapis-common'

// 1-on-1 예약 후보 회의실 리소스 캘린더 (목록 순서대로 우선 배정)
export const MEETING_ROOM_EMAILS = [
  'c_188aade4ijbjugt1g8792koso29e6@resource.calendar.google.com',
  'c_188estuf94f6ciunmn8dntruunt3g@resource.calendar.google.com',
  'c_188dus2peu8u2h3ogd2sls2ebte9u@resource.calendar.google.com',
  'c_188bfa39ni7reg48im2c5e576m2g0@resource.calendar.google.com',
  'c_188avol82eafmjmngb20sr5u570n0@resource.calendar.google.com',
  'c_188aum4u6ac3mg8fgvriln1njqtbe@resource.calendar.google.com',
  'c_1887uec2c6p7qibnh9cdvg97t49si@resource.calendar.google.com',
  'c_1889jn4r6f1s2jlkkkostaf91fa6q@resource.calendar.google.com',
  'c_1888955f8glcih3lijvrvqve1k4rk@resource.calendar.google.com',
  'c_18836g9edc2uoj67h46da1m1km5t6@resource.calendar.google.com',
  'c_1882ase4vtq40gusjavpkjah30s9e@resource.calendar.google.com',
  'c_18816t1hset6qi1lj5srcaovlfu2s@resource.calendar.google.com',
  'c_18807sq2ds4i2gumkdltm7qurvdc2@resource.calendar.google.com',
]

// 해당 시간대에 비어 있는 첫 회의실 이메일을 반환. 만실이거나 조회 실패 시 null (예약을 막지 않는다)
export async function findFreeRoom(
  auth: OAuth2Client,
  start: string,
  end: string
): Promise<string | null> {
  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: start,
        timeMax: end,
        timeZone: 'Asia/Seoul',
        items: MEETING_ROOM_EMAILS.map((id) => ({ id })),
      },
    })
    for (const email of MEETING_ROOM_EMAILS) {
      const cal = res.data.calendars?.[email]
      if (!cal) continue
      if (cal.errors && cal.errors.length > 0) continue  // 조회 불가 회의실은 스킵
      if ((cal.busy ?? []).length === 0) return email
    }
    return null
  } catch (e) {
    console.error('회의실 freebusy 조회 실패 — 회의실 없이 진행:', e)
    return null
  }
}
