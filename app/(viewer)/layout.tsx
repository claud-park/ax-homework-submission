'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { parseName } from '@/lib/utils'

/**
 * viewer 전용 경량 레이아웃.
 * 뷰어는 `/gallery` 한 화면만 접근하므로 내비게이션 없이 로그인 사용자 표시 + 로그아웃만 제공한다.
 */
export default function ViewerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        if (!user) return
        const raw = (user.user_metadata?.name as string | undefined) ?? user.email ?? ''
        setDisplayName(parseName(raw).displayName)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'hsl(var(--background))' }}>
      <header
        className="flex items-center px-6 flex-shrink-0 border-b"
        style={{ height: 52, background: 'var(--background)', borderColor: 'var(--border)' }}
      >
        <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>
          AX Champion
        </span>

        <div className="ml-auto flex items-center gap-3">
          {displayName && (
            <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-flo-caption1 font-medium hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <LogOut size={14} />
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
