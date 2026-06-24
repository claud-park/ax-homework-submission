import { NextRequest, NextResponse } from 'next/server'
import { exchangeChampionCode } from '@/lib/one-on-one/champion-google'

export async function GET(req: NextRequest) {
  const code   = req.nextUrl.searchParams.get('code')
  const userId = req.cookies.get('champion_oauth_uid')?.value

  if (!code || !userId) {
    return NextResponse.redirect(new URL('/my-project/one-on-one?error=oauth_failed', req.url))
  }

  try {
    await exchangeChampionCode(code, userId)
  } catch (err) {
    console.error('Champion Google OAuth 실패:', err)
    return NextResponse.redirect(new URL('/my-project/one-on-one?error=oauth_failed', req.url))
  }

  const res = NextResponse.redirect(new URL('/my-project/one-on-one?connected=true', req.url))
  res.cookies.delete('champion_oauth_uid')
  return res
}
