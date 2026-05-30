'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { ChampionProject, CharterSubmission, MilestoneStatus } from '@/lib/types'
import { parseName } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const CHARTER_SECTIONS = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
  { key: 'timeline', label: '06. Timeline · Milestones' },
]

export default function ChampionDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [data, setData] = useState<ChampionProject | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<ChampionProject>(`/api/champions/${userId}`)
      .then(setData)
      .catch(() => router.push('/'))
      .finally(() => setLoading(false))
  }, [userId, router])

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }
  if (!data) return null

  const { displayName, department } = parseName(data.user.name)
  const sortedMilestones = [...data.milestones].sort((a, b) =>
    (a.start_date ?? '').localeCompare(b.start_date ?? '')
  )

  return (
    <div>
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 전체 현황으로
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</h1>
        {department && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{department}</p>}
        {data.charter?.project_name && (
          <p className="text-sm mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>{data.charter.project_name}</p>
        )}
      </div>

      {data.charter && (
        <section id="charter" className="mb-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
          <div className="flex flex-col gap-3">
            {CHARTER_SECTIONS.map(s => {
              const html = data.charter!.content?.[s.key as keyof CharterSubmission['content']]
              if (!html) return null
              return (
                <div
                  key={s.key}
                  className="p-4 rounded-xl border"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    style={{ color: 'var(--text-primary)' }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {sortedMilestones.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>WBS / 마일스톤</h2>
          <div className="flex flex-col gap-2">
            {sortedMilestones.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.start_date ?? ''} ~ {m.due_date ?? ''}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-md"
                  style={{ color: STATUS_COLOR[m.status], background: `${STATUS_COLOR[m.status]}20` }}
                >
                  {STATUS_LABEL[m.status]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
