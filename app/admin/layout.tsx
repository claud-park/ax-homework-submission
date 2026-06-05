import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import { AdminSidebar } from './AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers()
  const pathname = headersList.get('x-pathname') ?? ''

  // /admin/login은 auth 체크 없이 렌더 (redirect 루프 방지)
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.user_metadata?.is_admin) redirect('/admin/login')

  const raw = user.user_metadata?.name ?? user.email ?? ''
  const { displayName } = parseName(raw)

  const serviceClient = createServiceClient()
  const [bottleneckResult, chartersResult] = await Promise.all([
    serviceClient.from('milestones').select('id').not('bottleneck_type', 'is', null),
    serviceClient.from('charter_submissions').select('id, admin_approved_at'),
  ])

  const pendingBottleneck = bottleneckResult.data?.length ?? 0
  const pendingCharters = (chartersResult.data ?? []).filter(c => !c.admin_approved_at).length

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <AdminSidebar
        initialPendingBottleneck={pendingBottleneck}
        initialPendingCharters={pendingCharters}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center px-6 flex-shrink-0 border-b"
          style={{ height: 52, background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', boxShadow: 'var(--shadow-s)' }}
        >
          <div className="md:hidden w-32" />
          {displayName && (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center justify-center rounded-full text-flo-caption2 font-semibold flex-shrink-0" style={{ width: 24, height: 24, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}>
                {displayName[0]}
              </div>
              <span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-secondary)' }}>{displayName}</span>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 overflow-auto md:pb-6 pb-20">{children}</main>
      </div>
    </div>
  )
}
