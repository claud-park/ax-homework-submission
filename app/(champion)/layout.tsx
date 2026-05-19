'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const NAV = [
  { emoji: '📋', label: '과제', href: '/' },
  { emoji: '📄', label: '과제정의서', href: '/charter' },
  { emoji: '📅', label: 'WBS', href: '/milestones' },
  { emoji: '📊', label: '진척도', href: '/progress' },
]

export default function ChampionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <aside className="w-44 flex-shrink-0 flex flex-col gap-1 p-4 border-r" style={{ background: 'hsl(var(--background))', borderColor: 'var(--border-subtle)' }}>
        <span className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>AX Homework</span>
        {NAV.map(item => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className="text-xs px-3 py-2 rounded-lg font-medium transition-colors"
              style={{
                background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
              }}
            >
              <span aria-hidden="true">{item.emoji}</span> {item.label}
            </a>
          )
        })}
        <div className="mt-auto">
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-2 rounded-lg w-full text-left"
            style={{ color: 'var(--text-disabled)' }}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
