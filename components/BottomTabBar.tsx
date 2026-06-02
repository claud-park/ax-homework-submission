'use client'

import type { LucideIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'

export interface BottomTab {
  icon: LucideIcon
  label: string
  href: string
  badge?: number
  exact?: boolean
}

export function BottomTabBar({ tabs }: { tabs: BottomTab[] }) {
  const pathname = usePathname()
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t"
      style={{
        background: 'var(--surface-primary)',
        borderColor: 'var(--border-subtle)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map(tab => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <a
            key={tab.href}
            href={tab.href}
            className="flex-1 flex flex-col items-center gap-1 py-2 relative"
            style={{ color: active ? 'var(--accent)' : 'var(--text-disabled)' }}
          >
            <div className="relative">
              <tab.icon size={20} strokeWidth={active ? 2.5 : 2} />
              {!!tab.badge && (
                <span
                  className="absolute -top-1 -right-2 flex items-center justify-center rounded-full text-white"
                  style={{
                    width: 15, height: 15, fontSize: 8, fontWeight: 700,
                    background: 'var(--error)',
                  }}
                >
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: 9, fontWeight: active ? 700 : 600, whiteSpace: 'nowrap' }}>
              {tab.label}
            </span>
            {active && (
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{ width: 4, height: 4, background: 'var(--accent)' }}
              />
            )}
          </a>
        )
      })}
    </nav>
  )
}
