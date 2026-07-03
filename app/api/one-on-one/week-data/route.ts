import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { getAvailableSlots } from '@/lib/one-on-one/calendar'
import { getChampionBusy, isChampionConnected } from '@/lib/one-on-one/champion-google'
import { KST_OFFSET_MS } from '@/lib/one-on-one/slot-utils'

// weekStart (YYYY-MM-DD KST 기준 월요일)의 Mon-Fri 날짜 배열 반환
function getWeekDates(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number)
  return Array.from({ length: 5 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i))
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  })
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const weekStart = req.nextUrl.searchParams.get('weekStart')
  const durStr    = req.nextUrl.searchParams.get('duration')
  if (!weekStart || !durStr) {
    return NextResponse.json({ error: 'weekStart and duration required' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'invalid weekStart format' }, { status: 400 })
  }
  const duration = parseInt(durStr) as 30 | 60
  if (duration !== 30 && duration !== 60) {
    return NextResponse.json({ error: 'duration must be 30 or 60' }, { status: 400 })
  }

  const dates = getWeekDates(weekStart)

  // 어드민 슬롯 (5일 병렬)
  const slotsByDay = await Promise.all(
    dates.map(date => getAvailableSlots(date, duration).catch(() => []))
  )
  const slots = slotsByDay.flat()

  // 챔피언 busy (연결된 경우)
  const connected = await isChampionConnected(user.id)
  let championBusy = null
  if (connected) {
    // 주 전체 UTC 범위 계산
    const [y, m, d] = weekStart.split('-').map(Number)
    const mondayKstMs    = Date.UTC(y, m - 1, d, 0, 0, 0)
    const fridayEndKstMs = Date.UTC(y, m - 1, d + 4, 23, 59, 59, 999)
    const timeMin = new Date(mondayKstMs    - KST_OFFSET_MS).toISOString()
    const timeMax = new Date(fridayEndKstMs - KST_OFFSET_MS).toISOString()
    championBusy = await getChampionBusy(user.id, timeMin, timeMax)
  }

  return NextResponse.json({ slots, championBusy, championConnected: connected })
}
