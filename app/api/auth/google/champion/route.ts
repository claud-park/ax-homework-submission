import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { verifyUser } from '@/lib/auth'
import { getChampionAuthUrl } from '@/lib/one-on-one/champion-google'

export async function GET(req: NextRequest) {
  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const nonce = randomUUID()
  const authUrl = getChampionAuthUrl(user.id, nonce)
  const res = NextResponse.redirect(authUrl)
  // userId와 nonce를 쿠키에 저장하여 callback에서 CSRF 검증에 사용
  res.cookies.set('champion_oauth_uid', JSON.stringify({ userId: user.id, nonce }), {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
