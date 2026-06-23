import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CheckUpSession } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  idle: '미처리', uploading: '업로드 중', transcribing: '전사 중',
  summarizing: '요약 중', done: '완료', error: '오류',
}
const STATUS_COLOR: Record<string, string> = {
  idle: 'var(--text-disabled)', uploading: 'var(--blue-600)',
  transcribing: 'var(--blue-600)', summarizing: 'var(--blue-600)',
  done: 'var(--success)', error: 'var(--error)',
}

export default async function ChampionSessionsPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: sessions } = await serviceClient
    .from('check_up_sessions')
    .select('*')
    .eq('champion_user_id', user.id)
    .order('session_date', { ascending: false })

  const list = (sessions ?? []) as CheckUpSession[]

  return (
    <div>
      <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>체크업 세션</h1>

      {list.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-disabled)' }}>
          아직 체크업 세션이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map(s => (
            <Link
              key={s.id}
              href={`/my-project/sessions/${s.id}`}
              className="flex items-center justify-between p-3 rounded-xl border"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.session_date}</p>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ color: STATUS_COLOR[s.processing_status], background: `${STATUS_COLOR[s.processing_status]}18` }}
              >
                {STATUS_LABEL[s.processing_status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
