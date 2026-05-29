'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { ChampionProject, Submission, MilestoneStatus, CharterSubmission } from '@/lib/types'
import { parseName } from '@/lib/utils'
import { ArrowLeft, Link } from 'lucide-react'
import { toast } from 'sonner'

function fmtMD(s: string): string {
  if (!s) return ''
  const [, m, d] = s.split('-').map(Number)
  return `${m}/${d}`
}

const MS_STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const MS_STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const SUB_STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const SUB_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
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

export default function AdminChampionPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [data, setData] = useState<ChampionProject | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  function loadSubs() {
    return apiFetch<Submission[]>(`/api/admin/users/${userId}/submissions`).then(setSubmissions)
  }

  useEffect(() => {
    Promise.all([
      apiFetch<ChampionProject>(`/api/champions/${userId}`).then(setData),
      loadSubs(),
    ])
      .catch(() => toast.error('데이터 로드 실패'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function approveCharter(charterId: string) {
    setApproving(true)
    try {
      const updated = await apiFetch<CharterSubmission>(`/api/admin/charters/${charterId}/approve`, { method: 'POST' })
      setData(prev => prev ? { ...prev, charter: prev.charter ? { ...prev.charter, admin_approved_at: updated.admin_approved_at } : null } : null)
      toast.success('과제정의서가 승인되었습니다.')
    } catch {
      toast.error('승인 처리에 실패했습니다.')
    } finally {
      setApproving(false)
    }
  }

  async function updateStatus(submissionId: string, status: 'accepted' | 'declined') {
    try {
      await apiFetch(`/api/admin/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      toast.success('상태 변경 완료')
      await loadSubs()
    } catch {
      toast.error('상태 변경 실패')
    }
  }

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

  const allMilestones = useMemo(() => {
    if (!data) return []
    const fromSubTasks = (data.sub_tasks ?? []).flatMap(st => st.milestones ?? [])
    return [...data.milestones, ...fromSubTasks]
      .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
  }, [data])

  return (
    <div>
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 대시보드로
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</h1>
        {department && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{department}</p>}
        {data.charter?.project_name && (
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{data.charter.project_name}</p>
        )}
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>과제 제출 이력</h2>
        {submissions.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>아직 제출 없음</p>
        ) : (
          <div className="flex flex-col gap-2">
            {submissions.map(sub => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  {sub.link_url ? (
                    <a
                      href={sub.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium truncate flex items-center gap-1"
                      style={{ color: 'var(--blue-600)' }}
                    >
                      <Link className="h-3 w-3 shrink-0" />
                      {sub.link_url}
                    </a>
                  ) : (
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                  )}
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-md"
                    style={{ color: SUB_STATUS_COLOR[sub.status], background: `${SUB_STATUS_COLOR[sub.status]}20` }}
                  >
                    {SUB_STATUS_LABEL[sub.status]}
                  </span>
                  {sub.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(sub.id, 'accepted')}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)', border: 'none', cursor: 'pointer' }}
                      >합격</button>
                      <button
                        onClick={() => updateStatus(sub.id, 'declined')}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--error)', border: 'none', cursor: 'pointer' }}
                      >불합격</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.charter && (
        <section id="charter" className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
            {data.charter.admin_approved_at ? (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--success)', border: '1px solid rgba(22,163,74,0.3)' }}
              >
                ✓ 승인됨 · {new Date(data.charter.admin_approved_at).toLocaleDateString('ko-KR')}
              </span>
            ) : (
              <button
                onClick={() => approveCharter(data.charter!.id)}
                disabled={approving}
                className="text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-50"
                style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer' }}
              >
                {approving ? '처리 중…' : '✓ 승인'}
              </button>
            )}
          </div>
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

      {/* 하위과제 그룹 (읽기 전용) */}
      {(data.sub_tasks ?? []).length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>하위과제</h2>
          <div className="flex flex-col gap-2">
            {(data.sub_tasks ?? []).map(st => (
              <div
                key={st.id}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  background: 'var(--surface-secondary)',
                }}
              >
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{st.title}</p>
                {st.description && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{st.description}</p>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
                  마일스톤 {(st.milestones ?? []).length}개
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {allMilestones.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>WBS / 마일스톤</h2>
          <div className="flex flex-col gap-2">
            {allMilestones.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtMD(m.start_date)} – {fmtMD(m.due_date)}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-md"
                  style={{ color: MS_STATUS_COLOR[m.status], background: `${MS_STATUS_COLOR[m.status]}20` }}
                >
                  {MS_STATUS_LABEL[m.status]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
