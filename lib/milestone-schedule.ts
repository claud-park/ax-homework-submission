import { HOLIDAYS_FALLBACK, toKey, parseKey, isWorkingDay } from '@/lib/holidays'

type Holidays = Record<string, string>

export function nextWorkingDay(key: string, holidays: Holidays = HOLIDAYS_FALLBACK): string {
  const d = parseKey(key)
  while (!isWorkingDay(d, holidays)) d.setDate(d.getDate() + 1)
  return toKey(d)
}

// addWorkingDays(key, 0) === nextWorkingDay(key); each step advances to the next working day.
export function addWorkingDays(key: string, n: number, holidays: Holidays = HOLIDAYS_FALLBACK): string {
  const d = parseKey(key)
  while (!isWorkingDay(d, holidays)) d.setDate(d.getDate() + 1)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    if (isWorkingDay(d, holidays)) added++
  }
  return toKey(d)
}

export interface RelativeMilestone {
  title: string
  description?: string
  offset_days: number   // start offset from project start, in working days
  duration_days: number // length in working days (>= 1)
  children?: RelativeMilestone[]
}

export interface ScheduledMilestone {
  title: string
  description?: string
  start_date: string
  due_date: string
  children?: ScheduledMilestone[]
}

function scheduleOne(projectStart: string, m: RelativeMilestone, holidays: Holidays): ScheduledMilestone {
  const start = addWorkingDays(projectStart, m.offset_days, holidays)
  const due = addWorkingDays(start, Math.max(1, m.duration_days) - 1, holidays)
  return {
    title: m.title,
    description: m.description,
    start_date: start,
    due_date: due,
    children: m.children?.map(c => scheduleOne(projectStart, c, holidays)),
  }
}

export function scheduleRelativeMilestones(
  startDate: string,
  milestones: RelativeMilestone[],
  holidays: Holidays = HOLIDAYS_FALLBACK,
): ScheduledMilestone[] {
  const projectStart = nextWorkingDay(startDate, holidays)
  return milestones.map(m => scheduleOne(projectStart, m, holidays))
}
