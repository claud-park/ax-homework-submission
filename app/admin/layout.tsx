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
          'w-44 flex-shrink-0 flex flex-col gap-1 p-4 border-r',
          'transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ background: 'hsl(var(--background))', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>관리자</span>
          <button
            className="md:hidden p-1 rounded"
            onClick={() => setDrawerOpen(false)}
            aria-label="메뉴 닫기"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {NAV.map(item => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg font-medium transition-colors"
              style={{
                background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
              }}
              onClick={() => setDrawerOpen(false)}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {item.label}
            </a>
          )
        })}

        <div className="mt-auto">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg w-full text-left"
            style={{ color: 'var(--text-disabled)' }}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div
          className="flex items-center px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border-subtle)', background: 'hsl(var(--background))' }}
        >
          {/* Hamburger + title (mobile only) */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="메뉴 열기"
              className="p-1 rounded"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>관리자</span>
          </div>

          {/* User name (right-aligned, always visible) */}
          {userName && (
            <span className="ml-auto text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {userName}
            </span>
          )}
        </div>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
