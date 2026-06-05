# Frontend Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server Components 전환 + Dynamic Import + 폰트 최적화로 페이지 로딩 및 전환 속도를 개선한다.

**Architecture:** 모든 데이터 조회(Read)는 Server Component에서 Supabase를 직접 쿼리해 HTML에 포함시키고, 상호작용(Write/Interactive)만 Client Component로 분리한다. 무거운 라이브러리(Gantt, TipTap, jsPDF, docx)는 dynamic import로 lazy load한다.

**Tech Stack:** Next.js 14 App Router, @supabase/ssr, next/font/local, React dynamic import

---

## File Map

| 상태 | 파일 | 역할 |
|---|---|---|
| 수정 | `lib/supabase/server.ts` | `createUserServerClient` 헬퍼 추가 |
| 수정 | `app/(champion)/layout.tsx` | Server Component 전환, `<Link>` 적용 |
| 신규 | `app/(champion)/ChampionSidebar.tsx` | 모바일 drawer 상태 관리 Client Component |
| 수정 | `app/admin/layout.tsx` | Server Component 전환, `<Link>` 적용 |
| 신규 | `app/admin/AdminSidebar.tsx` | 모바일 drawer + 뱃지 상태 Client Component |
| 수정 | `app/layout.tsx` | CDN 폰트 → `next/font/local` |
| 신규 | `public/fonts/PretendardVariable.woff2` | 폰트 파일 (다운로드) |
| 수정 | `app/(champion)/page.tsx` | Server Component wrapper |
| 수정 | `components/ChampionGanttView.tsx` | `initialData` prop 추가 |
| 수정 | `components/MobileChampionList.tsx` | `initialData` prop 추가 |
| 수정 | `app/(champion)/my-project/milestones/page.tsx` | Server Component wrapper |
| 신규 | `app/(champion)/my-project/milestones/MilestonesClient.tsx` | 기존 interactive 로직 |
| 수정 | `app/(champion)/my-project/charter/page.tsx` | Server Component wrapper |
| 신규 | `app/(champion)/my-project/charter/CharterClient.tsx` | 기존 editor 로직 |
| 수정 | `app/(champion)/my-project/submission/page.tsx` | Server Component wrapper |
| 신규 | `app/(champion)/my-project/submission/SubmissionClient.tsx` | 기존 upload 로직 |
| 수정 | `app/admin/page.tsx` | Server Component wrapper |
| 수정 | `app/admin/progress/page.tsx` | Server Component wrapper |
| 수정 | `app/admin/kanban/page.tsx` | Server Component wrapper |
| 수정 | `app/admin/reports/page.tsx` | Server Component wrapper |

---

## Task 1: Baseline Metrics 측정

**Files:** 없음 (측정만)

- [ ] **Step 1: next build로 번들 크기 측정**

```bash
bun run build 2>&1 | grep -A 50 "Route (app)"
```

결과에서 각 route의 `First Load JS` 크기를 메모한다.

- [ ] **Step 2: Lighthouse baseline 측정**

Chrome DevTools → Incognito 창 열기 → localhost:3000 접속 후:
1. DevTools → Lighthouse 탭
2. Mode: Navigation, Device: Desktop, Categories: Performance 선택
3. **Slow 4G throttling** 설정 (Network 탭에서)
4. `Analyze page load` 실행
5. FCP, LCP, TTFB 값 기록

- [ ] **Step 3: 페이지 전환 시간 측정**

DevTools → Network 탭 → "Disable cache" 체크 → 전체현황에서 내 과제정의서 클릭
→ Navigation 타이밍에서 전환 소요 시간 기록 (full reload 확인)

- [ ] **Step 4: 측정값을 Obsidian에 기록**

`/Users/claud_01/Documents/flo/AX/ax-homework-submission-2026-06-05-optimization.md`의 Metrics 표 Before 칸을 채운다.

---

## Task 2: `createUserServerClient` 헬퍼 추가

**Files:**
- Modify: `lib/supabase/server.ts`

Server Component에서 쿠키 기반으로 인증된 유저 컨텍스트로 Supabase를 쿼리하기 위한 헬퍼.  
기존 `createServiceClient`(service role key, admin API용)와 분리한다.

- [ ] **Step 1: `lib/supabase/server.ts` 수정**

```typescript
import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function createUserServerClient() {
  const cookieStore = cookies()
  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

- [ ] **Step 2: 타입 체크**

```bash
bun run typecheck
```

Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/supabase/server.ts
git commit -m "feat: add createUserServerClient for Server Component data fetching"
```

---

## Task 3: Champion Layout → Server Component

**Files:**
- Modify: `app/(champion)/layout.tsx`
- Create: `app/(champion)/ChampionSidebar.tsx`

`usePathname`(active 상태), `useState`(drawer), `handleLogout`은 Client Component으로 분리. 유저 이름은 서버에서 fetch.

- [ ] **Step 1: `app/(champion)/ChampionSidebar.tsx` 생성**

```typescript
'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Users, FileText, LayoutList, Upload, LogOut, Menu, X } from 'lucide-react'
import { BottomTabBar, type BottomTab } from '@/components/BottomTabBar'

const NAV = [
  { icon: Users,      label: '전체 현황',      href: '/',                      match: (p: string) => p === '/' || p.startsWith('/champions') },
  { icon: FileText,   label: '내 과제정의서',   href: '/my-project/charter',    match: (p: string) => p.startsWith('/my-project/charter') },
  { icon: LayoutList, label: '내 업무 현황',    href: '/my-project/milestones', match: (p: string) => p.startsWith('/my-project/milestones') },
  { icon: Upload,     label: '최종 과제 제출',  href: '/my-project/submission', match: (p: string) => p.startsWith('/my-project/submission') },
]

const MOBILE_TABS: BottomTab[] = [
  { icon: Users,      label: '전체 현황',   href: '/',                      exact: true },
  { icon: FileText,   label: '과제정의서',  href: '/my-project/charter' },
  { icon: LayoutList, label: '내 업무 현황', href: '/my-project/milestones' },
]

interface Props {
  userName: string
}

export function ChampionSidebar({ userName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [drawerOpen, setDrawerOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 md:static md:z-auto',
          'w-[220px] flex-shrink-0 flex flex-col px-3 py-5 border-r',
          'transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between px-3 pb-4 mb-2">
          <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>
            AX Champions&apos; League
          </span>
          <button
            className="md:hidden p-1 rounded"
            onClick={() => setDrawerOpen(false)}
            aria-label="메뉴 닫기"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-flo-body2 font-medium transition-colors relative"
                style={{
                  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onClick={() => setDrawerOpen(false)}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
                <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1" />

        <div className="px-3">
          <div className="h-px mb-3" style={{ background: 'var(--border-faint)' }} />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full py-1.5 text-flo-caption1 font-medium hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <LogOut className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* Topbar mobile menu button (rendered inside content area via portal-like pattern) */}
      <div
        className="flex items-center gap-3 md:hidden fixed top-0 left-0 z-30 px-6"
        style={{ height: 52 }}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="메뉴 열기"
          className="p-1 rounded"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>
          AX Champions&apos; League
        </span>
      </div>

      <BottomTabBar tabs={MOBILE_TABS} />
    </>
  )
}
```

- [ ] **Step 2: `app/(champion)/layout.tsx` 를 Server Component으로 교체**

```typescript
import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import { ChampionSidebar } from './ChampionSidebar'

export default async function ChampionLayout({ children }: { children: React.ReactNode }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw = user.user_metadata?.name ?? user.email ?? ''
  const { displayName } = parseName(raw)

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <ChampionSidebar userName={displayName} />

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center px-6 flex-shrink-0 border-b"
          style={{ height: 52, background: 'var(--background)', borderColor: 'var(--border)' }}
        >
          {/* mobile menu button space (handled in ChampionSidebar) */}
          <div className="md:hidden w-32" />

          {displayName && (
            <div className="ml-auto flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-full text-flo-caption2 font-semibold flex-shrink-0"
                style={{ width: 24, height: 24, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}
              >
                {displayName[0]}
              </div>
              <span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {displayName}
              </span>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 overflow-auto md:pb-6 pb-20">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: dev 서버에서 동작 확인**

```bash
bun run dev
```

브라우저에서 확인:
1. 사이드바 메뉴가 정상 렌더링되는지
2. 메뉴 클릭 시 전체 리로드 없이 페이지가 즉시 전환되는지 (Network 탭에서 document 요청 없어야 함)
3. 모바일 뷰에서 drawer 열림/닫힘 동작

- [ ] **Step 4: 타입 체크**

```bash
bun run typecheck
```

- [ ] **Step 5: 커밋**

```bash
git add app/\(champion\)/layout.tsx app/\(champion\)/ChampionSidebar.tsx
git commit -m "feat: convert champion layout to Server Component, fix nav to use Link"
```

---

## Task 4: Admin Layout → Server Component

**Files:**
- Modify: `app/admin/layout.tsx`
- Create: `app/admin/AdminSidebar.tsx`

Admin sidebar는 `pendingBottleneck`와 `pendingCharters` 뱃지가 있어 서버에서 초기값을 가져오고, pathname 변경 시 클라이언트에서 갱신한다.

- [ ] **Step 1: `app/admin/AdminSidebar.tsx` 생성**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-client'
import { LayoutDashboard, Layers, AlertTriangle, FileText, BarChart2, LogOut, Menu, X, Users } from 'lucide-react'
import { BottomTabBar, type BottomTab } from '@/components/BottomTabBar'

const NAV = [
  { icon: LayoutDashboard, label: '대시보드',     href: '/admin' },
  { icon: Users,           label: '챔피언 리스트', href: '/admin/champions' },
  { icon: Layers,          label: '제출 현황',     href: '/admin/kanban' },
  { icon: AlertTriangle,   label: '지연 신고',     href: '/admin/delay-reports' },
  { icon: FileText,        label: '주간 리포트',   href: '/admin/reports' },
]

interface Props {
  userName: string
  initialPendingBottleneck: number
  initialPendingCharters: number
}

export function AdminSidebar({ userName, initialPendingBottleneck, initialPendingCharters }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pendingBottleneck, setPendingBottleneck] = useState(initialPendingBottleneck)
  const [pendingCharters, setPendingCharters] = useState(initialPendingCharters)

  useEffect(() => {
    Promise.all([
      apiFetch<{ id: string }[]>('/api/admin/milestones/bottleneck-pending')
        .then(d => setPendingBottleneck(d.length))
        .catch(() => {}),
      apiFetch<{ id: string; admin_approved_at: string | null }[]>('/api/admin/charters')
        .then(d => setPendingCharters(d.filter(c => !c.admin_approved_at).length))
        .catch(() => {}),
    ])
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const MOBILE_TABS: BottomTab[] = [
    { icon: AlertTriangle, label: '지연 신고',  href: '/admin/delay-reports', badge: pendingBottleneck },
    { icon: FileText,      label: '과제정의서', href: '/admin/mobile/charters', badge: pendingCharters },
    { icon: BarChart2,     label: '리포트',     href: '/admin/reports' },
  ]

  return (
    <>
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 md:static md:z-auto',
          'w-[220px] flex-shrink-0 flex flex-col px-3 py-5 border-r',
          'transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', boxShadow: 'var(--shadow-s)' }}
      >
        <div className="flex items-center justify-between px-3 pb-4 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>관리자</span>
            <span className="text-flo-caption2 font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-secondary)', color: 'var(--text-disabled)', letterSpacing: '0.06em' }}>
              ADMIN
            </span>
          </div>
          <button className="md:hidden p-1 rounded" onClick={() => setDrawerOpen(false)} aria-label="메뉴 닫기" style={{ color: 'var(--text-secondary)' }}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-flo-body2 font-medium transition-colors relative"
                style={{
                  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onClick={() => setDrawerOpen(false)}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
                <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1" />

        <div className="px-3">
          <div className="h-px mb-3" style={{ background: 'var(--border-faint)' }} />
          <button onClick={handleLogout} className="flex items-center gap-2 w-full py-1.5 text-flo-caption1 font-medium hover:opacity-70 transition-opacity" style={{ color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <LogOut className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex items-center gap-3 md:hidden fixed top-0 left-0 z-30 px-6" style={{ height: 52 }}>
        <button onClick={() => setDrawerOpen(true)} aria-label="메뉴 열기" className="p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>관리자</span>
      </div>

      <BottomTabBar tabs={MOBILE_TABS} />
    </>
  )
}
```

- [ ] **Step 2: `app/admin/layout.tsx` 를 Server Component으로 교체**

```typescript
import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import { AdminSidebar } from './AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.user_metadata?.is_admin) redirect('/admin/login')

  const raw = user.user_metadata?.name ?? user.email ?? ''
  const { displayName } = parseName(raw)

  const serviceClient = createServiceClient()
  const [bottleneckResult, chartersResult] = await Promise.all([
    serviceClient.from('milestones').select('id').not('bottleneck_type', 'is', null),
    serviceClient.from('charter_submissions').select('id, admin_approved_at'),
  ])

  const pendingBottleneck = bottleneckResult.data?.length ?? 0
  const pendingCharters = (chartersResult.data ?? []).filter(c => !c.admin_approved_at).length

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <AdminSidebar
        userName={displayName}
        initialPendingBottleneck={pendingBottleneck}
        initialPendingCharters={pendingCharters}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center px-6 flex-shrink-0 border-b"
          style={{ height: 52, background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', boxShadow: 'var(--shadow-s)' }}
        >
          <div className="md:hidden w-32" />
          {displayName && (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center justify-center rounded-full text-flo-caption2 font-semibold flex-shrink-0" style={{ width: 24, height: 24, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}>
                {displayName[0]}
              </div>
              <span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-secondary)' }}>{displayName}</span>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 overflow-auto md:pb-6 pb-20">{children}</main>
      </div>
    </div>
  )
}
```

> **주의:** Admin layout에서 `/admin/login` 경로 처리(`if (pathname === '/admin/login') return <>{children}</>`)는 미들웨어에서 이미 처리하므로 제거한다.

- [ ] **Step 3: 타입 체크 및 동작 확인**

```bash
bun run typecheck
```

Admin 로그인 후 네비게이션이 SPA 방식으로 동작하는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add app/admin/layout.tsx app/admin/AdminSidebar.tsx
git commit -m "feat: convert admin layout to Server Component, fix nav to use Link"
```

---

## Task 5: 폰트 최적화 (CDN → next/font/local)

**Files:**
- Create: `public/fonts/PretendardVariable.woff2`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Pretendard Variable 폰트 다운로드**

```bash
mkdir -p public/fonts
curl -L "https://github.com/orioncactus/pretendard/releases/download/v1.3.9/Pretendard-1.3.9.zip" -o /tmp/pretendard.zip
unzip -o /tmp/pretendard.zip "web/variable/woff2/PretendardVariable.woff2" -d /tmp/pretendard-extracted/
cp /tmp/pretendard-extracted/web/variable/woff2/PretendardVariable.woff2 public/fonts/
ls -lh public/fonts/PretendardVariable.woff2
```

Expected: 파일이 존재하고 500KB 내외

- [ ] **Step 2: `app/layout.tsx` 수정**

```typescript
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
  weight: '100 900',
})

export const metadata: Metadata = {
  title: "AX Champions' League",
  description: "AX Champions' League — Dreamus AX 과제 관리 플랫폼",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>{children}<Toaster position="top-right" richColors /></body>
    </html>
  )
}
```

- [ ] **Step 3: `app/globals.css`에서 font-family 확인**

`globals.css`를 열어 `font-family`가 `Pretendard` 또는 `var(--font-pretendard)`를 참조하는지 확인.  
만약 `'Pretendard'`로 하드코딩되어 있다면 그대로 유지해도 됨 (localFont가 같은 이름으로 등록됨).  
CSS variable을 쓰는 경우 `font-family: var(--font-pretendard), sans-serif`로 교체.

- [ ] **Step 4: 렌더 블로킹 제거 확인**

```bash
bun run dev
```

Chrome DevTools → Network 탭 → `pretendard` CDN 요청이 없어야 함.  
Lighthouse "Eliminate render-blocking resources" 항목에서 pretendard CSS가 사라졌는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add public/fonts/PretendardVariable.woff2 app/layout.tsx
git commit -m "perf: replace CDN Pretendard with next/font/local to eliminate render blocking"
```

---

## Task 6: Champion 홈 페이지 Server Component

**Files:**
- Modify: `app/(champion)/page.tsx`
- Modify: `components/ChampionGanttView.tsx` (initialData prop 추가)
- Modify: `components/MobileChampionList.tsx` (initialData prop 추가)

현재 두 컴포넌트 모두 내부에서 `apiFetch`로 데이터를 가져온다. 서버에서 데이터를 가져와 prop으로 전달하도록 변경.

- [ ] **Step 1: `components/MobileChampionList.tsx`에 initialData prop 추가**

파일 상단의 함수 시그니처와 useEffect를 아래와 같이 수정:

```typescript
// 변경 전:
export function MobileChampionList() {
  const [champions, setChampions] = useState<ChampionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<ChampionSummary[]>('/api/champions')
      .then(setChampions)
      .catch(...)
      .finally(() => setLoading(false))
  }, [])

// 변경 후:
interface Props {
  initialData: ChampionSummary[]
}

export function MobileChampionList({ initialData }: Props) {
  const [champions, setChampions] = useState<ChampionSummary[]>(initialData)
  const [loading, setLoading] = useState(false)

  // useEffect 데이터 fetch 제거 (서버에서 받은 initialData 사용)
```

나머지 코드(filter, render)는 그대로 유지.

- [ ] **Step 2: `components/ChampionGanttView.tsx`에 initialData prop 추가**

파일 상단의 컴포넌트 시그니처를 찾아 수정:

```typescript
// GanttChampion 타입은 이미 import되어 있음
// 기존 인터페이스에 추가:
interface ChampionGanttViewProps {
  isAdmin?: boolean
  initialData?: GanttChampion[]  // 추가
}

export function ChampionGanttView({ isAdmin = false, initialData }: ChampionGanttViewProps) {
  // 기존: const [champions, setChampions] = useState<GanttChampion[]>([])
  const [champions, setChampions] = useState<GanttChampion[]>(initialData ?? [])
  // 기존: const [loading, setLoading] = useState(true)
  const [loading, setLoading] = useState(!initialData)

  useEffect(() => {
    if (initialData) return  // 서버에서 데이터 받았으면 skip
    apiFetch<GanttChampion[]>('/api/champions/gantt')
      .then(setChampions)
      .catch(...)
      .finally(() => setLoading(false))
  }, [initialData])
```

- [ ] **Step 3: `lib/data/champions.ts` 생성 (Admin 대시보드와 공유)**

```typescript
// lib/data/champions.ts
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { GanttChampion } from '@/app/api/champions/gantt/route'
import type { ChampionSummary } from '@/lib/types'

export async function fetchGanttData(): Promise<GanttChampion[]> {
  const supabase = createServiceClient()
  const [
    { data: users },
    { data: charters },
    { data: milestones },
  ] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('charter_submissions').select('user_id, id, project_name'),
    supabase.from('milestones')
      .select('id, user_id, title, start_date, due_date, status, week_number, parent_milestone_id')
      .eq('publish_status', 'published')
      .order('week_number', { nullsFirst: false })
      .order('display_order'),
  ])

  const charterMap = new Map((charters ?? []).map(c => [c.user_id, c]))
  const msMap = new Map<string, GanttChampion['milestones']>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({
      id: m.id, title: m.title, start_date: m.start_date, due_date: m.due_date,
      status: m.status, week_number: m.week_number, parent_milestone_id: m.parent_milestone_id ?? null,
    })
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const charter = charterMap.get(u.id)
    return {
      userId: u.id, name: displayName, department,
      projectName: charter?.project_name ?? null,
      charterSubmissionId: charter?.id ?? null,
      milestones: msMap.get(u.id) ?? [],
    }
  })
}

export async function fetchSummaryData(): Promise<ChampionSummary[]> {
  const supabase = createServiceClient()
  const [{ data: users }, { data: charters }, { data: milestones }] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('charter_submissions').select('user_id, id, project_name, publish_status'),
    supabase.from('milestones').select('user_id, week_number, status').eq('publish_status', 'published'),
  ])

  const charterMap = new Map((charters ?? []).map(c => [c.user_id, c]))
  const msMap = new Map<string, { week: number; status: string }[]>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({ week: m.week_number, status: m.status })
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const charter = charterMap.get(u.id)
    const weeklyStatus: Record<number, string> = {}
    for (const { week, status } of msMap.get(u.id) ?? []) {
      weeklyStatus[week] = status
    }
    return {
      userId: u.id, name: displayName, department,
      projectName: charter?.project_name ?? null,
      charterStatus: (charter?.publish_status ?? null) as ChampionSummary['charterStatus'],
      charterSubmissionId: charter?.id ?? null,
      weeklyStatus,
    }
  })
}
```

- [ ] **Step 4: `app/(champion)/page.tsx` Server Component로 교체**

```typescript
import { fetchGanttData, fetchSummaryData } from '@/lib/data/champions'
import { ChampionGanttView } from '@/components/ChampionGanttView'
import { MobileChampionList } from '@/components/MobileChampionList'

export default async function SummaryPage() {
  const [ganttData, summaryData] = await Promise.all([fetchGanttData(), fetchSummaryData()])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 mb-4">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>전체 현황</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>챔피언 프로젝트 진행 현황</p>
      </div>
      <div className="md:hidden">
        <MobileChampionList initialData={summaryData} />
      </div>
      <div className="hidden md:flex flex-col flex-1">
        <ChampionGanttView initialData={ganttData} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 동작 확인**

```bash
bun run dev
```

전체 현황 페이지: Gantt/카드 리스트가 로딩 스피너 없이 즉시 렌더링되는지 확인.

- [ ] **Step 5: 타입 체크**

```bash
bun run typecheck
```

- [ ] **Step 6: 커밋**

```bash
git add app/\(champion\)/page.tsx components/ChampionGanttView.tsx components/MobileChampionList.tsx
git commit -m "perf: server-side data fetch for champion home page (Gantt + MobileList)"
```

---

## Task 7: Milestones 페이지 Server Component

**Files:**
- Modify: `app/(champion)/my-project/milestones/page.tsx`
- Create: `app/(champion)/my-project/milestones/MilestonesClient.tsx`

- [ ] **Step 1: 기존 `milestones/page.tsx` 전체를 `MilestonesClient.tsx`로 복사**

```bash
cp "app/(champion)/my-project/milestones/page.tsx" "app/(champion)/my-project/milestones/MilestonesClient.tsx"
```

- [ ] **Step 2: `MilestonesClient.tsx` 수정**

파일 최상단 `'use client'` 유지.  
함수명 `WorkStatusPage` → `MilestonesClient`로 변경.  
`initialMilestones`와 `charterApproved` prop을 추가하고 초기 useState를 그 값으로 설정:

```typescript
// 추가할 interface (파일 상단 import 아래)
interface Props {
  initialMilestones: Milestone[]
  charterApproved: boolean
}

// 함수 시그니처 변경
export function MilestonesClient({ initialMilestones, charterApproved: initialCharterApproved }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones)
  const [charterApproved, setCharterApproved] = useState(initialCharterApproved)
  const [loading, setLoading] = useState(false)

  // useEffect의 초기 data fetch 부분 제거:
  // 기존: useEffect(() => { Promise.all([apiFetch milestones, apiFetch charter]) ... }, [])
  // → 삭제
```

나머지 코드(handleCheckinComplete, handleDeadlineRequest 등 모든 mutation 로직)는 그대로 유지.

- [ ] **Step 3: `milestones/page.tsx`를 얇은 Server Component로 교체**

```typescript
import { createUserServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Milestone } from '@/lib/types'
import { MilestonesClient } from './MilestonesClient'

export default async function WorkStatusPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: milestones }, { data: charters }] = await Promise.all([
    supabase.from('milestones').select('*').eq('user_id', user.id).order('display_order'),
    supabase.from('charter_submissions')
      .select('id, admin_approved_at')
      .eq('user_id', user.id),
  ])

  const charterApproved = (charters ?? []).some(c => !!c.admin_approved_at)

  return (
    <MilestonesClient
      initialMilestones={(milestones ?? []) as Milestone[]}
      charterApproved={charterApproved}
    />
  )
}
```

- [ ] **Step 4: 동작 확인**

```bash
bun run dev
```

내 업무 현황 페이지가 로딩 스피너 없이 즉시 렌더링, 체크인/날짜 변경 등 모든 인터랙션 정상 작동 확인.

- [ ] **Step 5: 타입 체크**

```bash
bun run typecheck
```

- [ ] **Step 6: 커밋**

```bash
git add "app/(champion)/my-project/milestones/"
git commit -m "perf: server-side data fetch for milestones page"
```

---

## Task 8: Charter 페이지 Server Component

**Files:**
- Modify: `app/(champion)/my-project/charter/page.tsx`
- Create: `app/(champion)/my-project/charter/CharterClient.tsx`

Charter 페이지는 840줄의 복잡한 TipTap 에디터 페이지. 동일한 패턴 적용.

- [ ] **Step 1: 기존 `charter/page.tsx`를 `CharterClient.tsx`로 복사**

```bash
cp "app/(champion)/my-project/charter/page.tsx" "app/(champion)/my-project/charter/CharterClient.tsx"
```

- [ ] **Step 2: `CharterClient.tsx` 수정**

```typescript
// 파일 최상단 'use client' 유지

// interface 추가 (타입 import 아래):
interface Props {
  initialCharter: ProjectCharter | null
  initialSubmissions: CharterSubmission[]
  initialMilestones: Milestone[]
}

// 함수명 변경 및 prop 추가:
export function CharterClient({ initialCharter, initialSubmissions, initialMilestones }: Props) {
  // 기존 useState 초기값을 prop으로 교체:
  const [charter, setCharter] = useState<ProjectCharter | null>(initialCharter)
  const [submissions, setSubmissions] = useState<CharterSubmission[]>(initialSubmissions)
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones)
  const [loading, setLoading] = useState(false)

  // 기존 useEffect 초기 fetch 블록 제거:
  // useEffect(() => { Promise.all([apiFetch charter, apiFetch submissions, apiFetch milestones]) }, [])
  // → 삭제
```

나머지 모든 저장/발행/댓글 로직은 유지.

- [ ] **Step 3: `charter/page.tsx`를 얇은 Server Component로 교체**

```typescript
import { createUserServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { ProjectCharter, CharterSubmission, Milestone } from '@/lib/types'
import { CharterClient } from './CharterClient'

export default async function CharterPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: charterData }, { data: submissions }, { data: milestones }] = await Promise.all([
    supabase.from('project_charters').select('*').eq('user_id', user.id).single(),
    supabase.from('charter_submissions').select('*').eq('user_id', user.id).order('submitted_at', { ascending: false }),
    supabase.from('milestones').select('id, title, start_date, due_date, week_number').eq('user_id', user.id).order('display_order'),
  ])

  return (
    <CharterClient
      initialCharter={(charterData ?? null) as ProjectCharter | null}
      initialSubmissions={(submissions ?? []) as CharterSubmission[]}
      initialMilestones={(milestones ?? []) as Milestone[]}
    />
  )
}
```

> **주의:** Supabase 테이블명과 컬럼명은 기존 API route (`app/api/charter/route.ts`)를 참고해 정확히 맞춘다.

- [ ] **Step 4: 동작 확인**

```bash
bun run dev
```

내 과제정의서: 에디터가 초기 내용으로 즉시 로드, 저장/발행/댓글 모두 정상 작동.

- [ ] **Step 5: 타입 체크**

```bash
bun run typecheck
```

- [ ] **Step 6: 커밋**

```bash
git add "app/(champion)/my-project/charter/"
git commit -m "perf: server-side data fetch for charter page"
```

---

## Task 9: Submission 페이지 Server Component

**Files:**
- Modify: `app/(champion)/my-project/submission/page.tsx`
- Create: `app/(champion)/my-project/submission/SubmissionClient.tsx`

- [ ] **Step 1: 기존 `submission/page.tsx`를 `SubmissionClient.tsx`로 복사**

```bash
cp "app/(champion)/my-project/submission/page.tsx" "app/(champion)/my-project/submission/SubmissionClient.tsx"
```

- [ ] **Step 2: `SubmissionClient.tsx` 수정**

```typescript
// 'use client' 유지

interface Props {
  initialSubmissions: Submission[]
}

export function SubmissionClient({ initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions)
  const [loading, setLoading] = useState(false)

  // 기존 useEffect fetch 제거:
  // useEffect(() => { load() }, [])
  // function load() { apiFetch... }
  // → 삭제 (단, handleUpload/handleLinkSubmit 이후 reload는 유지: load() 대신 apiFetch 직접 호출)
```

파일 업로드/링크 제출 후 목록 갱신 로직(`load()`)은 `apiFetch<Submission[]>('/api/submissions/mine').then(setSubmissions)`로 인라인 교체.

- [ ] **Step 3: `submission/page.tsx`를 얇은 Server Component로 교체**

```typescript
import { createUserServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Submission } from '@/lib/types'
import { SubmissionClient } from './SubmissionClient'

export default async function SubmissionPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  return <SubmissionClient initialSubmissions={(submissions ?? []) as Submission[]} />
}
```

- [ ] **Step 4: 동작 확인 및 커밋**

```bash
bun run dev
# 제출 페이지 로딩 즉시, 업로드/링크 제출 후 목록 갱신 확인
bun run typecheck
git add "app/(champion)/my-project/submission/"
git commit -m "perf: server-side data fetch for submission page"
```

---

## Task 10: Admin 페이지들 Server Component

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/progress/page.tsx`
- Modify: `app/admin/kanban/page.tsx`
- Modify: `app/admin/reports/page.tsx`

Admin 페이지는 service role client로 모든 유저 데이터에 접근. 각 페이지별 현재 useEffect fetch를 서버에서 실행.

- [ ] **Step 1: `app/admin/page.tsx` Server Component 전환**

admin 대시보드는 `ChampionGanttView`를 렌더링. Task 6에서 이미 `initialData` prop을 추가했으므로:

```typescript
import { fetchGanttData } from '@/lib/data/champions'
import { ChampionGanttView } from '@/components/ChampionGanttView'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'

export default async function AdminDashboard() {
  const ganttData = await fetchGanttData()

  return (
    <div>
      <DesktopOnlyNotice />
      <div className="hidden md:block">
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>전체 챔피언 현황</p>
        </div>
        <ChampionGanttView isAdmin initialData={ganttData} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `app/admin/progress/page.tsx` Server Component 전환**

파일 상단에서 현재 `useEffect`로 fetch하는 데이터를 확인하고, 동일한 패턴 적용:
1. `progress/page.tsx` → `progress/ProgressClient.tsx`로 복사
2. `ProgressClient` 함수에 `initialData` prop 추가, `useEffect` fetch 제거
3. `progress/page.tsx`를 서버 wrapper로 교체 (createServiceClient로 쿼리)

- [ ] **Step 3: `app/admin/kanban/page.tsx` Server Component 전환**

Kanban은 DnD 인터랙션이 많아 Client Component 비중이 높음. 동일 패턴:
1. `kanban/page.tsx` → `kanban/KanbanClient.tsx`로 복사
2. `initialData` prop 추가, 초기 fetch useEffect 제거
3. `kanban/page.tsx`를 서버 wrapper로 교체

- [ ] **Step 4: `app/admin/reports/page.tsx` Server Component 전환**

동일 패턴 적용.

- [ ] **Step 5: 타입 체크 및 확인**

```bash
bun run typecheck
bun run dev
# 각 admin 페이지 로딩 즉시 데이터 표시 확인
```

- [ ] **Step 6: 커밋**

```bash
git add app/admin/ lib/data/
git commit -m "perf: server-side data fetch for admin pages, extract shared data fetchers to lib/data"
```

---

## Task 11: Gantt + TipTap Dynamic Import

**Files:**
- Modify: `app/(champion)/page.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/(champion)/my-project/charter/CharterClient.tsx`

번들에서 heavy lib를 lazy load로 분리. Skeleton UI로 로딩 중 빈 화면 방지.

- [ ] **Step 1: Gantt skeleton 컴포넌트 추가**

`components/ui/skeleton.tsx`에 Gantt skeleton 추가 (또는 인라인):

```typescript
// components/GanttSkeleton.tsx
export function GanttSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <div className="h-8 w-32 rounded" style={{ background: 'var(--surface-secondary)' }} />
          <div className="h-8 flex-1 rounded" style={{ background: 'var(--surface-secondary)', opacity: 0.6 }} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: `app/(champion)/page.tsx`에서 ChampionGanttView dynamic import**

```typescript
import dynamic from 'next/dynamic'
import { GanttSkeleton } from '@/components/GanttSkeleton'

const ChampionGanttView = dynamic(
  () => import('@/components/ChampionGanttView').then(m => ({ default: m.ChampionGanttView })),
  { loading: () => <GanttSkeleton />, ssr: false }
)
// MobileChampionList는 상대적으로 가볍고 모바일 전용이므로 그대로 유지
```

- [ ] **Step 3: `app/admin/page.tsx`에서도 동일하게 dynamic import 적용**

```typescript
const ChampionGanttView = dynamic(
  () => import('@/components/ChampionGanttView').then(m => ({ default: m.ChampionGanttView })),
  { loading: () => <GanttSkeleton />, ssr: false }
)
```

- [ ] **Step 4: TipTap editor skeleton 추가**

```typescript
// components/EditorSkeleton.tsx
export function EditorSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border p-4" style={{ borderColor: 'var(--border)', minHeight: 200 }}>
      <div className="h-4 w-3/4 rounded mb-3" style={{ background: 'var(--surface-secondary)' }} />
      <div className="h-4 w-1/2 rounded mb-2" style={{ background: 'var(--surface-secondary)' }} />
      <div className="h-4 w-5/6 rounded" style={{ background: 'var(--surface-secondary)' }} />
    </div>
  )
}
```

- [ ] **Step 5: `CharterClient.tsx`에서 TipTap EditorContent dynamic import**

TipTap의 `useEditor`는 hook이므로 dynamic import 불가. 대신 `EditorContent`가 포함된 컴포넌트를 분리:

```typescript
// components/CharterEditor.tsx (새 파일)
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
// ... TipTap 관련 모든 import를 이 파일로 이동

interface Props {
  content: string
  onUpdate: (html: string) => void
  placeholder?: string
  editable?: boolean
}

export function CharterEditor({ content, onUpdate, placeholder, editable = true }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Underline, Placeholder.configure({ placeholder: placeholder ?? '' })],
    content,
    editable,
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
  })
  return <EditorContent editor={editor} />
}
```

`CharterClient.tsx`에서:
```typescript
// 기존 TipTap import들 제거
// dynamic import로 교체:
const CharterEditor = dynamic(
  () => import('@/components/CharterEditor').then(m => ({ default: m.CharterEditor })),
  { loading: () => <EditorSkeleton />, ssr: false }
)
```

- [ ] **Step 6: 번들 크기 확인**

```bash
bun run build 2>&1 | grep -A 30 "Route (app)"
```

Gantt/TipTap가 포함된 페이지의 chunk가 별도로 생성되었는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add app/\(champion\)/page.tsx app/admin/page.tsx components/ "app/(champion)/my-project/charter/CharterClient.tsx"
git commit -m "perf: dynamic import for ChampionGanttView and TipTap editor to reduce initial bundle"
```

---

## Task 12: PDF / Word 내보내기 On-Demand Import

**Files:**
- Modify: `app/(champion)/my-project/charter/CharterClient.tsx`

PDF/Word 내보내기 버튼 클릭 시에만 jsPDF, html2canvas, docx를 로드.

- [ ] **Step 1: `CharterClient.tsx`에서 PDF 내보내기 함수 수정**

```typescript
// 기존 파일 상단의 eager import 제거:
// import jsPDF from 'jspdf'
// import html2canvas from 'html2canvas'
// import { Document, Packer, ... } from 'docx'

// PDF 내보내기 핸들러를 on-demand import로 변경:
async function handleExportPDF() {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  // 기존 PDF 생성 로직 그대로 유지, jsPDF/html2canvas 변수 사용
}

// Word 내보내기 핸들러:
async function handleExportDocx() {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const { saveAs } = await import('file-saver')
  // 기존 docx 생성 로직 그대로 유지
}
```

- [ ] **Step 2: 번들 크기 재확인**

```bash
bun run build 2>&1 | grep -A 30 "Route (app)"
```

charter 페이지의 `First Load JS`가 Task 11 이전 대비 현저히 줄었는지 확인.

- [ ] **Step 3: PDF/Word 내보내기 동작 확인**

```bash
bun run dev
```

과제정의서 → PDF 내보내기 / Word 내보내기 버튼 클릭 → 파일 정상 다운로드 확인.

- [ ] **Step 4: 커밋**

```bash
git add "app/(champion)/my-project/charter/CharterClient.tsx"
git commit -m "perf: on-demand import for jsPDF, html2canvas, docx to eliminate from initial bundle"
```

---

## Task 13: After Metrics 측정 & Obsidian 업데이트

- [ ] **Step 1: next build로 번들 크기 재측정**

```bash
bun run build 2>&1 | grep -A 50 "Route (app)"
```

Task 1에서 기록한 값과 비교.

- [ ] **Step 2: Lighthouse 재측정**

Task 1과 동일한 조건(Incognito, Slow 4G, 캐시 비우기)에서 FCP, LCP, TTFB 측정.

- [ ] **Step 3: 페이지 전환 시간 재측정**

전체현황 → 내 과제정의서 클릭 시 Network 탭 확인. `document` 요청이 사라지고 SPA 전환만 발생하는지 확인.

- [ ] **Step 4: Obsidian 문서 업데이트**

`/Users/claud_01/Documents/flo/AX/ax-homework-submission-2026-06-05-optimization.md`의 Metrics 표 After 칸과 Phase 체크리스트를 채운다.

- [ ] **Step 5: 최종 커밋**

```bash
git add docs/
git commit -m "docs: update optimization metrics with after measurements"
```

---

## 예상 결과 요약

| 변경 | 개선 포인트 |
|---|---|
| `<a href>` → `<Link>` | 페이지 전환 full reload → SPA (~0ms 체감) |
| Layout Server Component | 레이아웃 재마운트 제거 |
| CDN font → next/font/local | render-blocking 제거 |
| Server Components | 빈 화면 → 즉시 데이터 있는 화면 |
| Dynamic import Gantt | 초기 번들 ~200KB 감소 |
| Dynamic import TipTap | 초기 번들 ~150KB 감소 |
| On-demand PDF/docx | 초기 번들 ~550KB 감소 |
| **합계** | **초기 번들 ~900KB 감소, LCP/FCP 대폭 개선** |
