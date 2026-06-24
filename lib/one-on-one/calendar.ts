import { google } from 'googleapis'
import { getAuthenticatedClient, ADMIN_IDS, type AdminId } from './google-auth'
import { getDayRange, isWorkingHour, overlapsLunchBreak } from './slot-utils'

export interface Slot {
  start: string          // ISO UTC
  end: string            // ISO UTC
  availableAdmins: AdminId[]
}

interface BusyInterval { start: string; end: string }

async function getAllBusyIntervals(
  timeMin: string,
  timeMax: string
): Promise<Map<AdminId, BusyInterval[]>> {
  const result = new Map<AdminId, BusyInterval[]>()
  await Promise.allSettled(
    ADMIN_IDS.map(async (adminId) => {
      try {
        const auth = await getAuthenticatedClient(adminId)
        const calendar = google.calendar({ version: 'v3', auth })
        const res = await calendar.freebusy.query({
          requestBody: {
            timeMin,
            timeMax,
            timeZone: 'Asia/Seoul',
            items: [{ id: 'primary' }],
          },
        })
        const busy = (res.data.calendars?.['primary']?.busy ?? []) as BusyInterval[]
        result.set(adminId, busy)
      } catch {
        // 토큰 없거나 에러 → 해당 어드민 스킵
      }
    })
  )
  return result
}

function isSlotFree(slotStart: Date, slotEnd: Date, busy: BusyInterval[]): boolean {
  return !busy.some(({ start, end }) =>
    slotStart < new Date(end) && slotEnd > new Date(start)
  )
}

// date: 'YYYY-MM-DD' (KST 기준), duration: 30 | 60
export async function getAvailableSlots(date: string, duration: 30 | 60): Promise<Slot[]> {
  const { timeMin, timeMax } = getDayRange(date)
  const busyMap = await getAllBusyIntervals(timeMin, timeMax)

  const slots: Slot[] = []
  const stepMs = duration * 60 * 1000
  const now = new Date()
  const current = new Date(timeMin)
  const end = new Date(timeMax)

  while (current < end) {
    const slotStart = new Date(current)
    const slotEnd   = new Date(current.getTime() + stepMs)

    if (
      slotStart > now &&
      isWorkingHour(slotStart.toISOString()) &&
      !overlapsLunchBreak(slotStart.toISOString(), slotEnd.toISOString())
    ) {
      const availableAdmins = ADMIN_IDS.filter((adminId) => {
        const busy = busyMap.get(adminId)
        if (busy === undefined) return false   // 미연결 어드민
        return isSlotFree(slotStart, slotEnd, busy)
      })
      if (availableAdmins.length > 0) {
        slots.push({
          start: slotStart.toISOString(),
          end:   slotEnd.toISOString(),
          availableAdmins,
        })
      }
    }
    current.setTime(current.getTime() + stepMs)
  }

  return slots
}
