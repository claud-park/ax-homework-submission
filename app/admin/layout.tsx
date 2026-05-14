'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const NAV = [
  { label: '📋 대시보드', href: '/admin' },
  { label: '📦 제출 현황', href: '/admin/kanban' },
  { label: '📊 진척도', href: '/admin/progress' },
  { label: '📅 기한 요청', href: '/admin/requests' },
  { label: '📄 주간 리포트', href: '/admin/reports' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  if (pathname === '/admin/login') return <>{children}</>

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--background)' }}>
      <aside className="w-44 flex-shrink-0 flex flex-col gap-1 p-4 border-r" style={{ background: 'var(--background)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>관리자</span>
        {NAV.map(item => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className="text-xs px-3 py-2 rounded-lg font-medium"
              style={{
                background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: active ? '#7dd3fc' : 'var(--text-secondary)',
              }}
            >
              {item.label}
            </a>
          )
        })}
        <div className="mt-auto">
          <button onClick={handleLogout} className="text-xs px-3 py-2 rounded-lg w-full text-left" style={{ color: 'var(--text-disabled)' }}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
