// API 키가 없거나 fetch 실패 시 사용하는 fallback 공휴일 목록 (2026–2027)
export const HOLIDAYS_FALLBACK: Record<string, string> = {
  // 2026
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일 (삼일절)',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일 (부처님오신날)',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일 (광복절)',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-09-28': '대체공휴일 (추석)',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일 (개천절)',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  // 2027
  '2027-01-01': '신정',
  '2027-02-05': '설날 연휴',
  '2027-02-06': '설날',
  '2027-02-07': '설날 연휴',
  '2027-02-08': '대체공휴일 (설날)',
  '2027-02-09': '대체공휴일 (설날 연휴)',
  '2027-03-01': '삼일절',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-08-15': '광복절',
  '2027-08-16': '대체공휴일 (광복절)',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절',
  '2027-10-04': '대체공휴일 (개천절)',
  '2027-10-09': '한글날',
  '2027-10-11': '대체공휴일 (한글날)',
  '2027-12-25': '성탄절',
  '2027-12-27': '대체공휴일 (성탄절)',
}

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isWorkingDay(d: Date, holidays: Record<string, string> = HOLIDAYS_FALLBACK): boolean {
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  return !holidays[toKey(d)]
}

export function countWorkingDays(start: string, end: string, holidays: Record<string, string> = HOLIDAYS_FALLBACK): number {
  if (!start || !end) return 0
  const s = parseKey(start)
  const e = parseKey(end)
  if (s > e) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    if (isWorkingDay(cur, holidays)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}
