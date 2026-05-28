# Layout System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FLO Design System 1.0 토큰을 사이드바·토바·로그인 4개 레이아웃 파일에 전면 적용, 클린 미니멀 비주얼로 개선

**Architecture:** 파일 4개 전체 교체 (pure visual, no logic change). 하드코딩 rgba/fontSize → CSS 변수 + `text-flo-*` Tailwind 유틸리티. 사이드바 220px, 토바 52px, active indicator bar, 아바타 이니셜, 로그인 카드 shadow-l + icon mark 신규 추가.

**Tech Stack:** Next.js 14 · TypeScript · Tailwind CSS (text-flo-* / shadow-flo-*) · FLO CSS 변수 (globals.css)

**Spec:** `docs/superpowers/specs/2026-05-28-layout-redesign-design.md`

---

## File Map

| File | Action | Key change |
|---|---|---|
| `app/(champion)/layout.tsx` | Overwrite | 220px sidebar, shadow-s, active indicator, 52px topbar, avatar |
| `app/admin/layout.tsx` | Overwrite | same + ADMIN badge |
| `app/login/page.tsx` | Overwrite | shadow-l, rounded-3xl, icon mark, accent button, Google SVG |
| `app/admin/login/page.tsx` | Overwrite | same card, email/pw inputs, accent button |

---

## Task 1: Champion Layout (`app/(champion)/layout.tsx`)

**Files:**
- Modify: `app/(champion)/layout.tsx`

- [ ] **Step 1: Replace the file**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Users, FolderOpen, LogOut, Menu, X } from 'lucide-react'
import { parseName } from '@/lib/utils'

const NAV = [
  { icon: Users, label: '전체 현황', href: '/' },
  { icon: FolderOpen, label: '내 프로젝트', href: '/my-project' },
]

export default function ChampionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const raw = data.user?.user_metadata?.name ?? data.user?.email ?? ''
      if (raw) setUserName(parseName(raw).displayName)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
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
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-s)',
        }}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between px-3 pb-4 mb-2">
          <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>
            AX Homework
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

        {/* Nav */}
        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => {
            const active = item.href === '/'
              ? pathname === '/' || pathname.startsWith('/champions')
              : pathname.startsWith(item.href)
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-flo-body2 font-medium transition-colors relative"
                style={{
                  background: active
                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : 'transparent',
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
              </a>
            )
          })}
        </nav>

        <div className="flex-1" />

        {/* Logout */}
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

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="flex items-center px-6 flex-shrink-0 border-b"
          style={{
            height: 52,
            background: 'var(--surface-primary)',
            borderColor: 'var(--border-subtle)',
            boxShadow: 'var(--shadow-s)',
          }}
        >
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
              className="p-1 rounded"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              AX Homework
            </span>
          </div>

          {userName && (
            <div className="ml-auto flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-full text-flo-caption2 font-semibold flex-shrink-0"
                style={{ width: 24, height: 24, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}
              >
                {userName[0]}
              </div>
              <span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {userName}
              </span>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: 0 errors (or only pre-existing unrelated errors)

- [ ] **Step 3: Commit**

```bash
git add app/\(champion\)/layout.tsx
git commit -m "[AX-1] feat: champion layout FLO 디자인 적용 (220px sidebar, topbar 52px, avatar)"
```

---

## Task 2: Admin Layout (`app/admin/layout.tsx`)

**Files:**
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Replace the file**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { LayoutDashboard, Layers, CalendarClock, FileText, LogOut, Menu, X } from 'lucide-react'
import { parseName } from '@/lib/utils'

const NAV = [
  { icon: LayoutDashboard, label: '대시보드', href: '/admin' },
  { icon: Layers, label: '제출 현황', href: '/admin/kanban' },
  { icon: CalendarClock, label: '기한 변경 요청', href: '/admin/requests' },
  { icon: FileText, label: '주간 리포트', href: '/admin/reports' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const raw = data.user?.user_metadata?.name ?? data.user?.email ?? ''
      if (raw) setUserName(parseName(raw).displayName)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  if (pathname === '/admin/login') return <>{children}</>

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
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
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-s)',
        }}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between px-3 pb-4 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>
              관리자
            </span>
            <span
              className="text-flo-caption2 font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--surface-secondary)',
                color: 'var(--text-disabled)',
                letterSpacing: '0.06em',
              }}
            >
              ADMIN
            </span>
          </div>
          <button
            className="md:hidden p-1 rounded"
            onClick={() => setDrawerOpen(false)}
            aria-label="메뉴 닫기"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-flo-body2 font-medium transition-colors relative"
                style={{
                  background: active
                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : 'transparent',
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
              </a>
            )
          })}
        </nav>

        <div className="flex-1" />

        {/* Logout */}
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

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="flex items-center px-6 flex-shrink-0 border-b"
          style={{
            height: 52,
            background: 'var(--surface-primary)',
            borderColor: 'var(--border-subtle)',
            boxShadow: 'var(--shadow-s)',
          }}
        >
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
              className="p-1 rounded"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>
              관리자
            </span>
          </div>

          {userName && (
            <div className="ml-auto flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-full text-flo-caption2 font-semibold flex-shrink-0"
                style={{ width: 24, height: 24, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}
              >
                {userName[0]}
              </div>
              <span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {userName}
              </span>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "[AX-1] feat: admin layout FLO 디자인 적용 (ADMIN 뱃지, active indicator, 52px topbar)"
```

---

## Task 3: Champion Login Page (`app/login/page.tsx`)

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Replace the file**

```tsx
'use client'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'hsl(var(--background))' }}
    >
      <div
        className="w-full max-w-[360px] p-10 rounded-3xl border"
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-l)',
        }}
      >
        {/* Icon mark */}
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        >
          <span className="text-flo-body1 font-bold" style={{ color: 'var(--accent)' }}>A</span>
        </div>

        <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          AX Homework
        </h1>
        <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
          챔피언 로그인
        </p>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90"
          style={{ height: 48, background: 'var(--accent)' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="white" fillOpacity=".9"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="white" fillOpacity=".9"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="white" fillOpacity=".9"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="white" fillOpacity=".9"/>
          </svg>
          Google로 계속하기
        </button>

        <p className="text-center mt-6 text-flo-caption1" style={{ color: 'var(--text-disabled)' }}>
          관리자는{' '}
          <a href="/admin/login" style={{ color: 'var(--blue-600)' }}>
            여기서 로그인
          </a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "[AX-1] feat: 챔피언 로그인 페이지 FLO 디자인 적용 (shadow-l, icon mark, accent 버튼)"
```

---

## Task 4: Admin Login Page (`app/admin/login/page.tsx`)

**Files:**
- Modify: `app/admin/login/page.tsx`

- [ ] **Step 1: Replace the file**

```tsx
'use client'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError || !data.user?.user_metadata?.is_admin) {
      setError('관리자 계정이 아니거나 비밀번호가 틀렸습니다.')
      await supabase.auth.signOut()
      return
    }
    router.push('/admin')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'hsl(var(--background))' }}
    >
      <div
        className="w-full max-w-[360px] p-10 rounded-3xl border"
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-l)',
        }}
      >
        {/* Icon mark */}
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        >
          <span className="text-flo-body1 font-bold" style={{ color: 'var(--accent)' }}>A</span>
        </div>

        <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          관리자 로그인
        </h1>
        <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
          Dreamus 어드민 계정으로 로그인하세요
        </p>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="text-flo-body2 outline-none"
            style={{
              height: 44, padding: '0 14px', borderRadius: 12, width: '100%',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="text-flo-body2 outline-none"
            style={{
              height: 44, padding: '0 14px', borderRadius: 12, width: '100%',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          {error && (
            <p className="text-flo-caption1" style={{ color: 'var(--error)' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl text-flo-body2 font-semibold text-white mt-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ height: 48, background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add app/admin/login/page.tsx
git commit -m "[AX-1] feat: 관리자 로그인 페이지 FLO 디자인 적용 (shadow-l, icon mark, accent 버튼)"
```

---

## Task 5: Push + PR

- [ ] **Step 1: Push branch**

```bash
git push origin feature/layout-redesign
```

- [ ] **Step 2: Create PR**

```bash
gh pr create \
  --title "[AX-1] feat: 레이아웃 시스템 FLO 디자인 적용" \
  --base main \
  --body "## Summary
- champion/admin 사이드바: 220px, shadow-s, active indicator bar, accent 색상 통일
- champion/admin 토바: 52px 고정 높이, shadow-s, 아바타 이니셜 추가
- 챔피언/관리자 로그인 카드: shadow-l, rounded-3xl, icon mark, 48px accent 버튼
- 하드코딩 rgba(37,99,235,...) 전량 → color-mix(in srgb, var(--accent) 12%, transparent)
- 인라인 fontSize → text-flo-* Tailwind 유틸리티 적용

## Test plan
- [ ] 로그인 페이지 비주얼 확인 (shadow-l, icon mark, 버튼)
- [ ] 사이드바 active 상태 indicator bar + accent 색상 확인
- [ ] 토바 52px, avatar initial 표시 확인
- [ ] 모바일 drawer 동작 이상 없음 확인
- [ ] bun run typecheck 통과"
```
