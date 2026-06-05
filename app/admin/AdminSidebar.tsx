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
