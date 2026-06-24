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
    console.error('Champion OAuth CSRF 실패', { code: !!code, stateParam, nonce: cookieData.nonce, userId: cookieData.userId })
    return NextResponse.redirect(new URL('/my-project/one-on-one?error=oauth_failed&reason=csrf', req.url))
  }

  try {
    await exchangeChampionCode(code, cookieData.userId)
  } catch (err) {
    console.error('Champion Google OAuth 실패:', err)
    const reason = err instanceof Error ? encodeURIComponent(err.message.slice(0, 80)) : 'unknown'
    return NextResponse.redirect(new URL(`/my-project/one-on-one?error=oauth_failed&reason=${reason}`, req.url))
  }

  const res = NextResponse.redirect(new URL('/my-project/one-on-one?connected=true', req.url))
  res.cookies.delete('champion_oauth_uid')
  return res
}
