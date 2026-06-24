'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { ChampionProject, Submission, MilestoneStatus, CharterSubmission, Milestone, Comment, SubmissionStatus } from '@/lib/types'
import { parseName } from '@/lib/utils'
import { ArrowLeft, Download, ExternalLink, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { AdminSessionList } from '@/components/sessions/AdminSessionList'
import { AdminSessionDetail } from '@/components/sessions/AdminSessionDetail'


const MS_STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연 / 미완료',
}
const MS_STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const MS_STATUS_BG: Record<MilestoneStatus, string> = {
  not_started: 'rgba(148,163,184,0.12)', in_progress: 'rgba(37,99,235,0.10)',
  completed: 'rgba(34,197,94,0.12)', delayed: 'rgba(248,113,113,0.12)',
}

function buildTree(milestones: Milestone[]): Milestone[] {
  const map = new Map<string, Milestone & { children: Milestone[] }>()
  milestones.forEach(m => map.set(m.id, { ...m, children: [] }))
  const roots: (Milestone & { children: Milestone[] })[] = []
  map.forEach(m => {
    if (m.parent_milestone_id && map.has(m.parent_milestone_id)) {
      map.get(m.parent_milestone_id)!.children.push(m)
    } else {
      roots.push(m)
    }
  })
  const sort = (arr: Milestone[]) => arr.sort((a, b) => {
    const orderDiff = (a.display_order ?? 0) - (b.display_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    const aDate = a.start_date ?? a.due_date ?? ''
    const bDate = b.start_date ?? b.due_date ?? ''
    return aDate.localeCompare(bDate)
  })
  map.forEach(m => sort(m.children))
  return sort(roots)
}

function MilestoneRow({ m, depth = 0 }: { m: Milestone & { children?: Milestone[] }; depth?: number }) {
  const color = MS_STATUS_COLOR[m.status]
  const bg = MS_STATUS_BG[m.status]
  const children = (m.children ?? []) as (Milestone & { children?: Milestone[] })[]
  const isParent = depth === 0

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        marginLeft: depth > 0 ? 20 : 0,
        position: 'relative',
      }}>
        {/* Tree connector for children */}
        {depth > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginRight: 6 }}>
            <div style={{ width: 12, height: 1, background: '#cbd5e1', flexShrink: 0 }} />
          </div>
        )}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isParent ? '9px 12px' : '6px 10px',
          borderRadius: isParent ? 8 : 6,
          background: isParent ? '#ffffff' : '#f8fafc',
          border: isParent ? `1.5px solid #e2e8f0` : '1px solid #e2e8f0',
          borderLeft: isParent ? `3px solid ${color}` : `2px solid ${color}40`,
          boxShadow: isParent ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {m.week_number != null && (
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-disabled)', flexShrink: 0 }}>{m.week_number}주차</span>
              )}
              <p title={m.title} style={{
                fontSize: isParent ? 13 : 12,
                fontWeight: isParent ? 600 : 500,
                color: 'var(--text-primary)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{m.title}</p>
            </div>
            {(m.start_date || m.due_date) && (
              <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '2px 0 0 0' }}>
                {m.start_date ?? ''}{m.start_date && m.due_date ? ' – ' : ''}{m.due_date ?? ''}
              </p>
            )}
            {m.note && (
              <p style={{
                fontSize: 10,
                color: 'var(--text-secondary)',
                margin: '3px 0 0 0',
                fontStyle: 'italic',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                📝 {m.note}
              </p>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, color, background: bg, flexShrink: 0, marginLeft: 8 }}>
            {MS_STATUS_LABEL[m.status]}
          </span>
        </div>
      </div>

      {/* Children with vertical line */}
      {children.length > 0 && (
        <div style={{ position: 'relative', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Vertical connector line */}
          <div style={{
            position: 'absolute',
            left: depth === 0 ? 20 : 20 + 20,
            top: 0,
            bottom: 6,
            width: 1,
            background: '#cbd5e1',
          }} />
          {children.map((c) => (
            <MilestoneRow key={c.id} m={c as Milestone & { children?: Milestone[] }} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
const SUB_STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const SUB_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
const CHARTER_SECTIONS = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
]

type SubWithComments = Submission & { comments?: Comment[] }
type CharterComment = { id: string; body: string; author_role: 'admin' | 'user'; author_id: string | null; created_at: string }

export default function AdminChampionPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [data, setData] = useState<ChampionProject | null>(null)
  const [submissions, setSubmissions] = useState<SubWithComments[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  // active charter tab state
  const [activeCharterId, setActiveCharterId] = useState<string | null>(null)

  // charter comments
  const [charterComments, setCharterComments] = useState<CharterComment[]>([])
  const [newCharterComment, setNewCharterComment] = useState('')
  const [postingCharter, setPostingCharter] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null)

  // feedback confirm flow
  const [confirmingSubId, setConfirmingSubId] = useState<string | null>(null)
  const [confirmingStatus, setConfirmingStatus] = useState<SubmissionStatus | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // comment flow
  const [newComment, setNewComment] = useState<Record<string, string>>({})
  const [posting, setPosting] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // session tab
  const [sessionTab, setSessionTab] = useState<'list' | 'detail'>('list')
  const [sessions, setSessions] = useState<import('@/lib/types').CheckUpSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [activeMainTab, setActiveMainTab] = useState<'submissions' | 'charter' | 'milestones' | 'sessions'>('charter')
  const [scrolled, setScrolled] = useState(false)
  const headerSentinelRef = useRef<HTMLDivElement>(null)

  // 헤더 위 sentinel을 IntersectionObserver로 감지해 컴팩트 고정 바로 전환.
  // (scrollTop 임계값 방식은 컴팩트 전환 시 헤더 높이가 줄어 임계값이 흔들려
  //  느린 스크롤에서 토글이 반복되는 flickering을 유발 → sentinel은 헤더 위에 있어
  //  헤더 높이 변화의 영향을 받지 않으므로 피드백 루프가 없음.)
  useEffect(() => {
    const sentinel = headerSentinelRef.current
    const main = document.querySelector('main')
    if (!sentinel || !main) return
    const io = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { root: main, threshold: 0 }
    )
    io.observe(sentinel)
    return () => io.disconnect()
  }, [data])

  function loadSubs() {
    return apiFetch<SubWithComments[]>(`/api/admin/users/${userId}/submissions`).then(setSubmissions)
  }

  function loadCharterComments(charterId: string) {
    return apiFetch<CharterComment[]>(`/api/charter/submissions/${charterId}/comments`).then(setCharterComments).catch(() => {})
  }

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createSupabaseBrowserClient }) => {
      createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
        setCurrentAdminId(session?.user?.id ?? null)
      })
    })
    Promise.all([
      apiFetch<ChampionProject>(`/api/champions/${userId}`).then(d => {
        setData(d)
        const firstId = d.charters[0]?.id ?? null
        setActiveCharterId(firstId)
        if (firstId) loadCharterComments(firstId)
      }),
      loadSubs(),
    ])
      .catch(() => toast.error('데이터 로드 실패'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Derived: active charter and filtered milestones
  const activeCharter = data?.charters.find(c => c.id === activeCharterId) ?? data?.charters[0] ?? null
  const activeCharterMilestones = (data?.milestones ?? []).filter(m =>
    activeCharterId ? m.charter_submission_id === activeCharterId : true
  )

  function handleTabChange(charterId: string) {
    setActiveCharterId(charterId)
    setCharterComments([])
    loadCharterComments(charterId)
  }

  async function postCharterComment() {
    if (!activeCharter?.id || !newCharterComment.trim()) return
    setPostingCharter(true)
    try {
      await apiFetch(`/api/charter/submissions/${activeCharter.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newCharterComment.trim() }),
      })
      toast.success('코멘트가 작성되었습니다.')
      setNewCharterComment('')
      await loadCharterComments(activeCharter.id)
    } catch {
      toast.error('코멘트 작성 실패')
    } finally {
      setPostingCharter(false)
    }
  }

  async function saveEditCharterComment(commentId: string) {
    if (!editingBody.trim()) return
    try {
      await apiFetch(`/api/charter/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: editingBody.trim() }),
      })
      setCharterComments(prev => prev.map(c => c.id === commentId ? { ...c, body: editingBody.trim() } : c))
      setEditingCommentId(null)
    } catch {
      toast.error('편집 실패')
    }
  }

  async function deleteCharterComment(commentId: string) {
    if (!window.confirm('코멘트를 삭제하시겠습니까?')) return
    try {
      await apiFetch(`/api/charter/comments/${commentId}`, { method: 'DELETE' })
      setCharterComments(prev => prev.filter(c => c.id !== commentId))
    } catch {
      toast.error('삭제 실패')
    }
  }

  async function approveCharter(charterId: string) {
    setApproving(true)
    try {
      const updated = await apiFetch<CharterSubmission>(`/api/admin/charters/${charterId}/approve`, { method: 'POST' })
      setData(prev => {
        if (!prev) return null
        return {
          ...prev,
          charters: prev.charters.map(c =>
            c.id === charterId ? { ...c, admin_approved_at: updated.admin_approved_at } : c
          ),
        }
      })
      toast.success('과제정의서가 승인되었습니다.')
    } catch {
      toast.error('승인 처리에 실패했습니다.')
    } finally {
      setApproving(false)
    }
  }

  function openConfirm(subId: string, status: SubmissionStatus, currentFeedback: string | null) {
    setConfirmingSubId(subId)
    setConfirmingStatus(status)
    setFeedbackText(currentFeedback ?? '')
  }

  function cancelConfirm() {
    setConfirmingSubId(null)
    setConfirmingStatus(null)
    setFeedbackText('')
  }

  async function confirmStatusChange() {
    if (!confirmingSubId || !confirmingStatus) return
    setUpdatingStatus(confirmingSubId)
    try {
      await apiFetch(`/api/admin/submissions/${confirmingSubId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: confirmingStatus, feedback: feedbackText }),
      })
      toast.success('상태가 변경되었습니다.')
      cancelConfirm()
      await loadSubs()
    } catch {
      toast.error('상태 변경 실패')
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function postComment(subId: string) {
    const trimmed = (newComment[subId] ?? '').trim()
    if (!trimmed) return
    setPosting(subId)
    try {
      await apiFetch(`/api/admin/submissions/${subId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmed }),
      })
      toast.success('코멘트가 작성되었습니다.')
      setNewComment(prev => ({ ...prev, [subId]: '' }))
      await loadSubs()
    } catch {
      toast.error('코멘트 작성 실패')
    } finally {
      setPosting(null)
    }
  }

  async function downloadFile(subId: string) {
    setDownloadingId(subId)
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/admin/storage/${subId}/download`)
      window.open(url, '_blank')
    } catch (e) {
      toast.error('다운로드 URL 생성 실패: ' + (e as Error).message)
    } finally {
      setDownloadingId(null)
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

  return (
    <div>
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 대시보드로
      </button>

      {/* sticky 전환 트리거 (헤더 위에 위치 — 헤더 높이 변화에 영향받지 않음) */}
      <div ref={headerSentinelRef} aria-hidden style={{ height: 1 }} />

      <div
        className="mb-6"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          transition: 'padding 0.15s ease, background 0.15s ease',
          ...(scrolled
            ? {
                // 음수 top/좌우 마진으로 main의 p-6(1.5rem) 패딩을 덮어 상단 빈 공간 제거
                top: '-1.5rem',
                margin: '0 -1.5rem 16px',
                padding: '12px 1.5rem',
                background: 'var(--surface-primary)',
                borderBottom: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-s)',
              }
            : {}),
        }}
      >
        {scrolled ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
            {data.charters[0]?.project_name && (
              <>
                <span style={{ color: 'var(--text-disabled)' }}>|</span>
                <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{data.charters[0].project_name}</span>
              </>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</h1>
            {department && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{department}</p>}
            {data.charters[0]?.project_name && (
              <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{data.charters[0].project_name}</p>
            )}
          </>
        )}
      </div>

      {/* Main Tab Bar */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'charter', label: '과제정의서' },
          { key: 'sessions', label: '1-on-1 세션' },
          { key: 'submissions', label: '제출물' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveMainTab(tab.key)
              if (tab.key === 'sessions') {
                setSessionTab('list')
                apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
                  .then(setSessions)
                  .catch(() => {})
              }
            }}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{
              background: activeMainTab === tab.key ? 'var(--blue-600)' : 'var(--surface-secondary)',
              color: activeMainTab === tab.key ? '#fff' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeMainTab === 'submissions' && (
      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>과제 제출 이력</h2>
        {submissions.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>아직 제출 없음</p>
        ) : (
          <div className="flex flex-col gap-4">
            {submissions.map(sub => {
              const isConfirming = confirmingSubId === sub.id
              const isUpdating = updatingStatus === sub.id
              const comments = (sub.comments ?? []).slice().sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
              return (
                <div
                  key={sub.id}
                  className="rounded-xl border"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  {/* 헤더: 파일/링크 + 상태 */}
                  <div className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      {sub.link_url ? (
                        <a
                          href={sub.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate flex items-center gap-1"
                          style={{ color: 'var(--blue-600)' }}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {sub.link_url}
                        </a>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                          <button
                            onClick={() => downloadFile(sub.id)}
                            disabled={downloadingId === sub.id}
                            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
                            style={{ color: 'var(--blue-600)', background: 'rgba(37,99,235,0.08)', border: 'none', cursor: 'pointer' }}
                          >
                            {downloadingId === sub.id ? <Spinner size="sm" /> : <Download className="h-3 w-3" />}
                          </button>
                        </div>
                      )}
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')} · {relativeTime(sub.submitted_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-md"
                        style={{ color: SUB_STATUS_COLOR[sub.status], background: `${SUB_STATUS_COLOR[sub.status]}20` }}
                      >
                        {SUB_STATUS_LABEL[sub.status]}
                      </span>
                      {(['accepted', 'declined'] as SubmissionStatus[]).map(s => (
                        <button
                          key={s}
                          onClick={() => isConfirming && confirmingStatus === s ? cancelConfirm() : openConfirm(sub.id, s, sub.feedback ?? null)}
                          disabled={isUpdating || (confirmingSubId !== null && confirmingSubId !== sub.id)}
                          className="text-xs px-2 py-1 rounded font-semibold"
                          style={{
                            background: sub.status === s
                              ? `${SUB_STATUS_COLOR[s]}20`
                              : isConfirming && confirmingStatus === s
                                ? SUB_STATUS_COLOR[s]
                                : 'transparent',
                            color: isConfirming && confirmingStatus === s ? '#fff' : SUB_STATUS_COLOR[s],
                            border: `1px solid ${SUB_STATUS_COLOR[s]}`,
                            cursor: 'pointer',
                            opacity: isUpdating ? 0.5 : 1,
                          }}
                        >
                          {s === 'accepted' ? '합격' : '불합격'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 기존 피드백 표시 */}
                  {sub.feedback && !isConfirming && (
                    <div className="px-3 pb-3">
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>피드백</p>
                      <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{sub.feedback}</p>
                    </div>
                  )}

                  {/* 상태 변경 확인 + 피드백 입력 */}
                  {isConfirming && (
                    <div
                      className="mx-3 mb-3 rounded-lg border p-3 flex flex-col gap-2"
                      style={{ borderColor: `${SUB_STATUS_COLOR[confirmingStatus!]}40`, background: `${SUB_STATUS_COLOR[confirmingStatus!]}06` }}
                    >
                      <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        피드백 <span style={{ color: 'var(--text-disabled)', fontWeight: 400 }}>(선택)</span>
                      </label>
                      <textarea
                        value={feedbackText}
                        onChange={e => setFeedbackText(e.target.value)}
                        placeholder="이번 제출에 대한 피드백을 남겨주세요"
                        rows={3}
                        className="w-full text-xs rounded-md border p-2 resize-none"
                        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelConfirm}
                          className="text-xs px-3 py-1.5 rounded-md font-semibold"
                          style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >취소</button>
                        <button
                          onClick={confirmStatusChange}
                          disabled={isUpdating}
                          className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-50 flex items-center gap-1"
                          style={{ background: SUB_STATUS_COLOR[confirmingStatus!], color: '#fff', cursor: 'pointer' }}
                        >
                          {isUpdating && <Spinner size="sm" />}
                          {SUB_STATUS_LABEL[confirmingStatus!]}으로 변경
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 코멘트 */}
                  <div
                    className="px-3 pb-3 pt-2 flex flex-col gap-2"
                    style={{ borderTop: '1px solid var(--border-faint)' }}
                  >
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      코멘트 {comments.length > 0 ? `(${comments.length})` : ''}
                    </p>
                    {comments.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {comments.map(c => (
                          <div
                            key={c.id}
                            className="rounded-md border p-2 text-xs"
                            style={{
                              background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            <div className="flex justify-between mb-0.5">
                              <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                                {c.author_role === 'admin' ? '관리자' : '챔피언'}
                              </span>
                              <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <textarea
                        value={newComment[sub.id] ?? ''}
                        onChange={e => setNewComment(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            postComment(sub.id)
                          }
                        }}
                        placeholder="코멘트 작성 (Cmd+Enter)"
                        rows={3}
                        className="flex-1 text-xs rounded-md border p-2 resize-none"
                        style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                      <button
                        onClick={() => postComment(sub.id)}
                        disabled={posting === sub.id || !(newComment[sub.id] ?? '').trim()}
                        className="text-xs inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold disabled:opacity-40 self-end"
                        style={{ background: 'var(--blue-600)', color: '#fff', cursor: 'pointer', border: 'none' }}
                      >
                        {posting === sub.id ? <Spinner size="sm" /> : <Send className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      )}

      {activeMainTab === 'charter' && data.charters.length > 0 && (
        <section id="charter" className="mb-8">
          {/* Charter 탭 (2개 이상일 때만 표시) */}
          {data.charters.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1.5px solid var(--border-subtle)', paddingBottom: 0 }}>
              {data.charters.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleTabChange(c.id)}
                  style={{
                    padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 14, fontWeight: activeCharterId === c.id ? 700 : 400,
                    color: activeCharterId === c.id ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: activeCharterId === c.id ? '2px solid var(--primary)' : '2px solid transparent',
                    marginBottom: -1.5,
                  }}
                >
                  {c.title ?? c.project_name ?? 'Charter'}
                </button>
              ))}
            </div>
          )}

          {/* 헤더: 제목 + 승인 버튼 */}
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
            {activeCharter?.admin_approved_at ? (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--success)', border: '1px solid rgba(22,163,74,0.3)' }}
              >
                ✓ 승인됨 · {new Date(activeCharter.admin_approved_at).toLocaleDateString('ko-KR')}
              </span>
            ) : activeCharter ? (
              <button
                onClick={() => approveCharter(activeCharter.id)}
                disabled={approving}
                className="text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-50"
                style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer' }}
              >
                {approving ? '처리 중…' : '✓ 승인'}
              </button>
            ) : null}
          </div>

          {/* 2-column: 좌(과제정의서) + 우(코멘트 패널) */}
          <div className="flex gap-6 items-start">

            {/* 좌측: 과제정의서 내용 */}
            <div className="flex flex-col gap-3 flex-1 min-w-0">
              {CHARTER_SECTIONS.map(s => {
                const html = activeCharter?.content?.[s.key as keyof CharterSubmission['content']]
                if (!html) return null
                return (
                  <div key={s.key} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                    <div className="charter-editor">
                      <div className="ProseMirror" style={{ padding: 0, fontSize: '0.8125rem', lineHeight: 1.65, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  </div>
                )
              })}

              {/* 06. Timeline · Milestones */}
              <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>06. Timeline · Milestones</p>
                {activeCharterMilestones.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {buildTree(activeCharterMilestones).map(m => (
                      <MilestoneRow key={m.id} m={m as Milestone & { children?: Milestone[] }} depth={0} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-disabled)', margin: 0 }}>(마일스톤 없음)</p>
                )}
              </div>

              {/* 07. 마무리 */}
              <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>07. Closing · 마무리</p>
                {activeCharter?.content.closing ? (
                  <div className="charter-editor">
                    <div className="ProseMirror" style={{ padding: 0, fontSize: '0.8125rem', lineHeight: 1.65, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: activeCharter.content.closing }} />
                  </div>
                ) : (
                  <p className="text-xs italic" style={{ color: 'var(--text-disabled)', margin: 0 }}>(내용 없음)</p>
                )}
              </div>
            </div>

            {/* 우측: sticky 코멘트 패널 */}
            <div
              style={{
                width: 300,
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                maxHeight: 'calc(100vh - 120px)',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-primary)',
                overflow: 'hidden',
              }}
            >
              {/* 패널 헤더 */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  코멘트 {charterComments.length > 0 ? `(${charterComments.length})` : ''}
                </p>
              </div>

              {/* 코멘트 목록 (스크롤) */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {charterComments.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-disabled)', textAlign: 'center', padding: '16px 0' }}>
                    아직 코멘트가 없습니다
                  </p>
                ) : (
                  charterComments.map(c => (
                    <div
                      key={c.id}
                      className="rounded-md border p-2 text-xs"
                      style={{
                        background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex justify-between mb-0.5">
                        <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                          {c.author_role === 'admin' ? '관리자' : '챔피언'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                          {c.author_id === currentAdminId && (
                            <button
                              onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body) }}
                              style={{ color: 'var(--text-disabled)', fontSize: '10px' }}
                            >편집</button>
                          )}
                          <button
                            onClick={() => deleteCharterComment(c.id)}
                            style={{ color: 'var(--error)', fontSize: '10px' }}
                          >삭제</button>
                        </div>
                      </div>
                      {editingCommentId === c.id ? (
                        <div>
                          <textarea
                            value={editingBody}
                            onChange={e => setEditingBody(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border p-1.5 resize-none mb-1"
                            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', fontSize: '12px' }}
                          />
                          <div className="flex gap-1.5">
                            <button onClick={() => setEditingCommentId(null)}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>취소</button>
                            <button onClick={() => saveEditCharterComment(c.id)}
                              className="text-xs px-2 py-0.5 rounded font-semibold"
                              style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* 입력창 (하단 고정) */}
              <div style={{ padding: 12, borderTop: '2px solid var(--border-subtle)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-secondary)' }}>
                <textarea
                  value={newCharterComment}
                  onChange={e => setNewCharterComment(e.target.value)}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      postCharterComment()
                    }
                  }}
                  placeholder="코멘트 작성 (Cmd+Enter)"
                  rows={20}
                  className="w-full text-xs rounded-md border p-2 resize-none"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
                />
                <button
                  onClick={postCharterComment}
                  disabled={postingCharter || !newCharterComment.trim()}
                  className="w-full text-xs inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 font-semibold disabled:opacity-40"
                  style={{ background: 'var(--blue-600)', color: '#fff', cursor: 'pointer', border: 'none' }}
                >
                  {postingCharter ? <Spinner size="sm" /> : <Send className="h-3 w-3" />}
                  {postingCharter ? '전송 중…' : '코멘트 작성'}
                </button>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* 마일스톤 그룹 (읽기 전용) */}

      {activeMainTab === 'sessions' && (
        <section className="mb-8">
          {data.charters[0]?.id && (
            <div className="flex justify-end mb-3">
              <button
                onClick={() => window.open(`/charter-popup/${data.charters[0].id}`, 'charter-popup', 'width=900,height=700,scrollbars=yes')}
                className="text-xs font-semibold"
                style={{ background: 'transparent', border: '1px solid var(--blue-600)', color: 'var(--blue-600)', cursor: 'pointer', padding: '4px 12px', borderRadius: 6, fontWeight: 600 }}
              >
                과제정의서 보기
              </button>
            </div>
          )}
          {sessionTab === 'list' ? (
            <AdminSessionList
              championUserId={userId}
              sessions={sessions}
              milestones={data?.milestones ?? []}
              onSelect={(s) => { setSelectedSessionId(s.id); setSessionTab('detail') }}
              onRefresh={() => {
                apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
                  .then(setSessions)
                  .catch(() => {})
              }}
            />
          ) : selectedSessionId ? (
            <AdminSessionDetail
              sessionId={selectedSessionId}
              currentAdminId={currentAdminId ?? ''}
              onBack={() => {
                setSessionTab('list')
                apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
                  .then(setSessions)
                  .catch(() => {})
              }}
              onDeleted={() => {
                setSessionTab('list')
                apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
                  .then(setSessions)
                  .catch(() => {})
              }}
            />
          ) : null}
        </section>
      )}
    </div>
  )
}
