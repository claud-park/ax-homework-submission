import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createUserServerClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import { ChampionSidebar } from './ChampionSidebar'
import { HotlineFAB } from '@/components/HotlineFAB'
import { ChampionAnalytics } from '@/components/analytics/ChampionAnalytics'

export default async function ChampionLayout({ children }: { children: React.ReactNode }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRow } = await supabase
    .from('users')
    .select('user_group')
    .eq('id', user.id)
    .single()

  const isAdmin = Boolean(user.user_metadata?.is_admin)

  const raw = user.user_metadata?.name ?? user.email ?? ''
  const { displayName } = parseName(raw)

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <Suspense fallback={null}>
        <ChampionAnalytics
          userId={user.id}
          email={user.email}
          userGroup={(userRow?.user_group as string | null) ?? null}
          isAdmin={isAdmin}
        />
      </Suspense>
      <ChampionSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center px-6 flex-shrink-0 border-b"
          style={{ height: 52, background: 'var(--background)', borderColor: 'var(--border)' }}
        >
          {/* mobile menu button space (handled in ChampionSidebar) */}
          <div className="md:hidden w-32" />

          {displayName && (
            <div className="ml-auto flex items-center gap-2">
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
        </header>

        <main className="flex-1 p-6 overflow-auto md:pb-6 pb-20">{children}</main>
      </div>

      <HotlineFAB />
    </div>
  )
}
