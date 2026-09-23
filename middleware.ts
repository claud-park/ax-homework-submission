import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Already-authenticated redirects for login pages
  if (path === '/login' && user && user.app_metadata?.is_admin !== true)
    return NextResponse.redirect(new URL('/', request.url))
  if (path === '/admin/login' && user?.app_metadata?.is_admin === true)
    return NextResponse.redirect(new URL('/admin', request.url))

  // Protect champion routes
  const championRoutes = ['/', '/my-project', '/homework', '/charter', '/milestones', '/progress', '/pairing', '/champions']
  const isChampionRoute = championRoutes.some(r => path === r || path.startsWith(r + '/'))
  if (isChampionRoute && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // viewer는 champion 라우트 접근 시 /gallery로 리다이렉트
  // (public.users는 RLS가 "전부 거부, service key만 우회"이므로 anon 키 기반
  //  세션 클라이언트로는 user_group을 읽을 수 없다 — 반드시 service client 사용)
  if (isChampionRoute && user && user.app_metadata?.is_admin !== true) {
    const serviceClient = createServiceClient()
    const { data: profile } = await serviceClient
      .from('users')
      .select('user_group')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.user_group === 'viewer') {
      return NextResponse.redirect(new URL('/gallery', request.url))
    }
  }

  // Protect gallery route (로그인만 필요 — champion/partner/viewer 누구나 열람 가능)
  if (path === '/gallery' && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  // Protect admin routes
  if (path.startsWith('/admin') && !path.startsWith('/admin/login')) {
    if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))
    if (user.app_metadata?.is_admin !== true)
      return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  supabaseResponse.headers.set('x-pathname', path)
  return supabaseResponse
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
