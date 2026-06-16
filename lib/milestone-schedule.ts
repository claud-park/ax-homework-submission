import { HOLIDAYS_FALLBACK, toKey, parseKey, isWorkingDay, countWorkingDays } from '@/lib/holidays'

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

export interface DraftLike {
  title: string
  description?: string
  start_date: string | null
  due_date: string | null
  children?: DraftLike[]
}

// Inverse of scheduleRelativeMilestones: absolute-dated draft → working-day relative form.
export function draftToRelative(
  milestones: DraftLike[],
  startDate: string,
  holidays: Holidays = HOLIDAYS_FALLBACK,
): RelativeMilestone[] {
  const projectStart = nextWorkingDay(startDate, holidays)
  const one = (m: DraftLike): RelativeMilestone => {
    const start = m.start_date ?? projectStart
    const offset_days = Math.max(0, countWorkingDays(projectStart, start, holidays) - 1)
    const duration_days = m.start_date && m.due_date
      ? Math.max(1, countWorkingDays(m.start_date, m.due_date, holidays))
      : 1
    return {
      title: m.title,
      description: m.description,
      offset_days,
      duration_days,
      children: m.children?.map(one),
    }
  }
  return milestones.map(one)
}
