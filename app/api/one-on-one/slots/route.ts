import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { getAvailableSlots } from '@/lib/one-on-one/calendar'
import { getChampionBusy, isChampionConnected } from '@/lib/one-on-one/champion-google'
import { getDayRange } from '@/lib/one-on-one/slot-utils'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const date = req.nextUrl.searchParams.get('date')
  const durStr = req.nextUrl.searchParams.get('duration')
  if (!date || !durStr) {
    return NextResponse.json({ error: 'date and duration required' }, { status: 400 })
  }

  const duration = parseInt(durStr) as 30 | 60
  if (duration !== 30 && duration !== 60) {
    return NextResponse.json({ error: 'duration must be 30 or 60' }, { status: 400 })
  }

  try {
    const [slots, connected] = await Promise.all([
      getAvailableSlots(date, duration),
      isChampionConnected(user.id),
    ])

    let championBusy = null
    if (connected) {
      const { timeMin, timeMax } = getDayRange(date)
      championBusy = await getChampionBusy(user.id, timeMin, timeMax)
    }

    return NextResponse.json({ slots, championBusy, championConnected: connected })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
