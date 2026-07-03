import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
  const championRoutes = ['/', '/my-project', '/homework', '/charter', '/milestones', '/progress']
  const isChampionRoute = championRoutes.some(r => path === r || path.startsWith(r + '/'))
  if (isChampionRoute && !user)
    return NextResponse.redirect(new URL('/login', request.url))

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
