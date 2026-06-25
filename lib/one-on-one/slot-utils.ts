export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function toKST(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS)
}

// 특정 날짜(YYYY-MM-DD KST)의 00:00–23:59:59 UTC 범위 반환
export function getDayRange(dateStr: string): { timeMin: string; timeMax: string } {
  // dateStr은 KST 기준 날짜 (예: "2026-06-25")
  const [year, month, day] = dateStr.split('-').map(Number)
  // KST 00:00 → UTC = KST - 9h
  const startKst = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  const endKst   = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
  const timeMin = new Date(startKst.getTime() - KST_OFFSET_MS).toISOString()
  const timeMax = new Date(endKst.getTime()   - KST_OFFSET_MS).toISOString()
  return { timeMin, timeMax }
}

export function isWorkingHour(isoUtc: string): boolean {
  const kst = toKST(new Date(isoUtc))
  const dayOfWeek = kst.getUTCDay()
  const hour = kst.getUTCHours()
  return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 10 && hour < 17
}

const LUNCH_START_MIN = 11 * 60 + 30
const LUNCH_END_MIN   = 13 * 60

export function overlapsLunchBreak(startIsoUtc: string, endIsoUtc: string): boolean {
  const start = toKST(new Date(startIsoUtc))
  const end   = toKST(new Date(endIsoUtc))
  const startMin = start.getUTCHours() * 60 + start.getUTCMinutes()
  const endMin   = end.getUTCHours()   * 60 + end.getUTCMinutes()
  return startMin < LUNCH_END_MIN && endMin > LUNCH_START_MIN
}

// "6/25(목) 14:00" 형태 (Slack 메시지용)
export function formatSlotLabel(isoUtc: string): string {
  const kst = toKST(new Date(isoUtc))
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const day   = days[kst.getUTCDay()]
  const month = kst.getUTCMonth() + 1
  const date  = kst.getUTCDate()
  const hour  = String(kst.getUTCHours()).padStart(2, '0')
  const min   = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${month}/${date}(${day}) ${hour}:${min}`
}

// "2026.06.26 16:00 ~ 16:30" 형태 (취소 DM용)
export function formatSlotRange(startIsoUtc: string, endIsoUtc: string): string {
  const s = toKST(new Date(startIsoUtc))
  const e = toKST(new Date(endIsoUtc))
  const year  = s.getUTCFullYear()
  const month = String(s.getUTCMonth() + 1).padStart(2, '0')
  const date  = String(s.getUTCDate()).padStart(2, '0')
  const sh = String(s.getUTCHours()).padStart(2, '0')
  const sm = String(s.getUTCMinutes()).padStart(2, '0')
  const eh = String(e.getUTCHours()).padStart(2, '0')
  const em = String(e.getUTCMinutes()).padStart(2, '0')
  return `${year}.${month}.${date} ${sh}:${sm} ~ ${eh}:${em}`
}

// "14:00" 형태 (UI 슬롯 버튼용)
export function formatTimeKST(isoUtc: string): string {
  const kst = toKST(new Date(isoUtc))
  const hour = String(kst.getUTCHours()).padStart(2, '0')
  const min  = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${hour}:${min}`
}
