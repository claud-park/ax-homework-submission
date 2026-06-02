'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Users, FileText, LayoutList, Upload, LogOut, Menu, X } from 'lucide-react'
import { parseName } from '@/lib/utils'
import { BottomTabBar, type BottomTab } from '@/components/BottomTabBar'

const NAV = [
  { icon: Users,      label: '전체 현황',      href: '/',                      match: (p: string) => p === '/' || p.startsWith('/champions') },
  { icon: FileText,   label: '내 과제정의서',   href: '/my-project/charter',    match: (p: string) => p.startsWith('/my-project/charter') },
  { icon: LayoutList, label: '내 업무 현황',    href: '/my-project/milestones', match: (p: string) => p.startsWith('/my-project/milestones') },
  { icon: Upload,     label: '최종 과제 제출',  href: '/my-project/submission', match: (p: string) => p.startsWith('/my-project/submission') },
]

export default function ChampionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userName, setUserName] = useState('')

  const MOBILE_TABS: BottomTab[] = [
    { icon: Users,      label: '전체 현황',   href: '/',                      exact: true },
    { icon: FileText,   label: '과제정의서',  href: '/my-project/charter' },
    { icon: LayoutList, label: '내 업무 현황', href: '/my-project/milestones' },
  ]

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
          background: 'var(--background)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between px-3 pb-4 mb-2">
          <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>
            AX Champions' League
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
            const active = item.match(pathname)
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
            background: 'var(--background)',
            borderColor: 'var(--border)',
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
              AX Champions' League
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

        <main className="flex-1 p-6 overflow-auto md:pb-6 pb-20">{children}</main>
        <BottomTabBar tabs={MOBILE_TABS} />
      </div>
    </div>
  )
}
