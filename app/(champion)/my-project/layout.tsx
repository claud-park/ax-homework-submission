'use client'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: '과제정의서', href: '/my-project/charter' },
  { label: 'WBS / 마일스톤', href: '/my-project/milestones' },
  { label: '파일 제출', href: '/my-project/submission' },
]

export default function MyProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>내 프로젝트</h1>
        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <a
                key={tab.href}
                href={tab.href}
                className="text-xs px-4 py-2 font-medium transition-colors"
                style={{
                  color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
                  borderBottom: active ? '2px solid var(--blue-600)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </a>
            )
          })}
        </div>
      </div>
      {children}
    </div>
  )
}
