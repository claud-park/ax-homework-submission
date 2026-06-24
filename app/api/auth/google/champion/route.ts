import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/auth'
import { getChampionAuthUrl } from '@/lib/one-on-one/champion-google'

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authUrl = getChampionAuthUrl(user.id)
  const res = NextResponse.redirect(authUrl)
  // userId를 쿠키에 저장하여 callback에서 사용
  res.cookies.set('champion_oauth_uid', user.id, {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  })
  return res
}
