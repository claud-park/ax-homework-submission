import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth'
import { getAvailableSlots } from '@/lib/one-on-one/calendar'

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date')       // 'YYYY-MM-DD'
  const durStr = req.nextUrl.searchParams.get('duration') // '30' | '60'
  if (!date || !durStr) {
    return NextResponse.json({ error: 'date and duration required' }, { status: 400 })
  }

  const duration = parseInt(durStr) as 30 | 60
  if (duration !== 30 && duration !== 60) {
    return NextResponse.json({ error: 'duration must be 30 or 60' }, { status: 400 })
  }

  try {
    const slots = await getAvailableSlots(date, duration)
    return NextResponse.json({ slots })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
