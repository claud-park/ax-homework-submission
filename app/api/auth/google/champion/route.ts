import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createUserServerClient } from '@/lib/supabase/server'
import { getChampionAuthUrl } from '@/lib/one-on-one/champion-google'

export async function GET(req: NextRequest) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

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
