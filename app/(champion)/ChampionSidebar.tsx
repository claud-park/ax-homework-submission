'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-client'
import { Users, FileText, LayoutList, Upload, LogOut, Menu, X, Calendar, Video } from 'lucide-react'
import { BottomTabBar, type BottomTab } from '@/components/BottomTabBar'
import type { Milestone } from '@/lib/types'

const NAV = [
  { icon: Users,      label: '전체 현황',      href: '/',                      match: (p: string) => p === '/' || p.startsWith('/champions') },
  { icon: FileText,   label: '내 과제정의서',   href: '/my-project/charter',    match: (p: string) => p.startsWith('/my-project/charter') },
  { icon: LayoutList, label: '내 업무 현황',    href: '/my-project/milestones', match: (p: string) => p.startsWith('/my-project/milestones') },
  { icon: Upload,     label: '최종 과제 제출',  href: '/my-project/submission', match: (p: string) => p.startsWith('/my-project/submission') },
  { icon: Calendar,   label: '1-on-1 세션',     href: '/my-project/sessions',   match: (p: string) => p.startsWith('/my-project/sessions') },
  { icon: Video,      label: '1-on-1 신청하기', href: '/my-project/one-on-one', match: (p: string) => p.startsWith('/my-project/one-on-one') },
]

const MOBILE_TABS: BottomTab[] = [
  { icon: Users,      label: '전체 현황',   href: '/',                      exact: true },
  { icon: FileText,   label: '과제정의서',  href: '/my-project/charter' },
  { icon: LayoutList, label: '내 업무 현황', href: '/my-project/milestones' },
  { icon: Calendar,   label: '체크업',       href: '/my-project/sessions' },
  { icon: Video,      label: '1-on-1',       href: '/my-project/one-on-one' },
]

export function ChampionSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hasDelayed, setHasDelayed] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    apiFetch<Milestone[]>('/api/milestones')
      .then(milestones => {
        setHasDelayed(milestones.some(m =>
          m.publish_status === 'published' && m.start_date && m.due_date &&
          m.status !== 'completed' &&
          (m.due_date < today || (m.start_date < today && m.status === 'not_started'))
        ))
      })
      .catch(() => {})
  }, [])

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
          <Link
            href="/"
            className="text-flo-body1 font-semibold hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => setDrawerOpen(false)}
          >
            AX Champions&apos; League
          </Link>
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
                {item.href === '/my-project/milestones' && hasDelayed && (
                  <span
                    className="ml-1 flex-shrink-0 rounded-full"
                    style={{ width: 6, height: 6, background: '#ef4444' }}
                    aria-label="지연/미완료 마일스톤 있음"
                  />
                )}
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

      {/* Topbar mobile menu button */}
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
