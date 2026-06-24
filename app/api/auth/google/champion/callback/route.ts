import { NextRequest, NextResponse } from 'next/server'
import { exchangeChampionCode } from '@/lib/one-on-one/champion-google'

export async function GET(req: NextRequest) {
  const code       = req.nextUrl.searchParams.get('code')
  const stateParam = req.nextUrl.searchParams.get('state')

  let cookieData: { userId?: string; nonce?: string } = {}
  try {
    cookieData = JSON.parse(req.cookies.get('champion_oauth_uid')?.value ?? '{}')
  } catch {
    // 파싱 실패 시 빈 객체 유지
  }

  if (!code || !stateParam || stateParam !== cookieData.nonce || !cookieData.userId) {
    return NextResponse.redirect(new URL('/my-project/one-on-one?error=oauth_failed', req.url))
  }

  try {
    await exchangeChampionCode(code, cookieData.userId)
  } catch (err) {
    console.error('Champion Google OAuth 실패:', err)
    return NextResponse.redirect(new URL('/my-project/one-on-one?error=oauth_failed', req.url))
  }

  const res = NextResponse.redirect(new URL('/my-project/one-on-one?connected=true', req.url))
  res.cookies.delete('champion_oauth_uid')
  return res
}
