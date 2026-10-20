import { createServiceClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'
import { applyPendingInvitesForUser } from '@/lib/data/season-invites'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const host = request.headers.get('host') ?? new URL(request.url).host
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const code = searchParams.get('code')
  const next = sanitizeRedirectPath(searchParams.get('next'))
  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const response = NextResponse.redirect(`${origin}${next}`)

  // Use @supabase/ssr client so exchangeCodeForSession writes session cookies into the response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN
  if (!allowedDomain || !data.user.email?.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`)
  }

  // Upsert user record via service key (bypasses RLS)
  const serviceClient = createServiceClient()
  const user = data.user
  await serviceClient.from('users').upsert({
    id: user.id,
    email: user.email ?? '',
    name: user.user_metadata?.full_name ?? user.email ?? '',
    avatar_url: user.user_metadata?.avatar_url ?? null,
  }, { onConflict: 'id' })

  // 시즌 사전 등록(season_invites)이 있으면 enrollment/user_group으로 변환한다.
  // 실패해도 로그인은 막지 않는다 — 관리자가 시즌 화면에서 수동 배정할 수 있다.
  if (user.email) {
    try {
      await applyPendingInvitesForUser(serviceClient, user.id, user.email.toLowerCase())
    } catch (e) {
      console.error('[auth/callback] applyPendingInvitesForUser failed:', (e as Error).message)
    }
  }

  return response
}
