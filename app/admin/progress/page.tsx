'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { Milestone, User } from '@/lib/types'

type HomeworkInfo = { id: number; title: string } | null
type MilestoneWithUser = Milestone & { users: User; homeworks: HomeworkInfo }
type ViewMode = 'user' | 'homework'

type CharterContent = {
  problem_definition?: string
  goal?: string
  scope_in?: string
  scope_out?: string
  expected_outcomes?: string
  risks?: string
  [key: string]: string | undefined
}
type CharterWithUser = {
  id: string
  user_id: string
  homework_id: number | null
  project_name: string | null
  content: CharterContent
  submitted_at: string
  updated_at: string
  users: User
}

const CHARTER_SECTIONS: { key: string; label: string }[] = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)' },
  { key: 'goal', label: '목표 (TO-BE)' },
  { key: 'scope_in', label: '범위 In' },
  { key: 'scope_out', label: '범위 Out' },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
]

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: '#94a3b8', in_progress: '#f59e0b', completed: '#22c55e', delayed: '#f87171',
}
const STATUS_BG: Record<string, string> = {
  not_started: 'rgba(148,163,184,0.12)',
  in_progress: 'rgba(245,158,11,0.12)',
  completed: 'rgba(34,197,94,0.12)',
  delayed: 'rgba(248,113,113,0.12)',
}

const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()
const todayStr = new Date(todayMs).toISOString().split('T')[0]

function isOverdue(m: Milestone) {
  return new Date(m.due_date).getTime() < todayMs && m.status !== 'completed'
}

function daysFromToday(dueDate: string): number {
  return Math.ceil((new Date(dueDate).getTime() - todayMs) / 86400000)
}

function stripHtml(html: string) { return html.replace(/<[^>]*>/g, '').trim() }

// ─── shared sub-components ────────────────────────────────────────────────────

function UserAvatar({ user, size = 28 }: { user: User; size?: number }) {
  return user.avatar_url
    ? <img src={user.avatar_url} style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }} alt="" />
    : (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(37,99,235,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: `${Math.round(size * 0.46)}px`, fontWeight: 700, color: 'var(--blue-600)' }}>
          {user.name[0]}
        </span>
      </div>
    )
}

function DueDateBadge({ m }: { m: Milestone }) {
  const overdue = isOverdue(m)
  const days = daysFromToday(m.due_date)
  const urgent = !overdue && m.status !== 'completed' && days <= 3

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '6px' }}>
      <p style={{ fontSize: '10px', margin: 0, color: overdue ? '#f87171' : 'var(--text-disabled)', fontWeight: overdue ? 700 : 400 }}>
        마감 {m.due_date}
      </p>
      {m.status !== 'completed' && (
        <p style={{ fontSize: '11px', fontWeight: 700, margin: 0, color: overdue ? '#f87171' : urgent ? '#f59e0b' : 'var(--text-disabled)' }}>
          {overdue ? `D+${Math.abs(days)} 경과` : days === 0 ? 'D-day' : `D-${days}`}
        </p>
      )}
    </div>
  )
}

function MilestoneCard({ m }: { m: MilestoneWithUser }) {
  const overdue = isOverdue(m)
  const sc = STATUS_COLOR[m.status]

  return (
    <div style={{
      width: '148px', flexShrink: 0,
      borderRadius: '10px',
      border: overdue ? '1.5px solid rgba(248,113,113,0.5)' : '1px solid var(--border-subtle)',
      background: overdue ? 'rgba(248,113,113,0.04)' : 'var(--surface-secondary)',
      padding: '10px 12px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: STATUS_BG[m.status], color: sc }}>
          {m.week_number}주차
        </span>
        {overdue && <span style={{ fontSize: '11px' }} title="마감 초과">⚠️</span>}
      </div>
      <p style={{
        fontSize: '12px', fontWeight: 600, margin: '0 0 4px 0',
        color: 'var(--text-primary)', lineHeight: 1.35,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {m.title}
      </p>
      <span style={{ fontSize: '10px', fontWeight: 600, color: sc }}>{STATUS_LABEL[m.status]}</span>
      <DueDateBadge m={m} />
    </div>
  )
}

function OverdueBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
      ⚠️ {count}건 지연
    </span>
  )
}

// ─── Charter card ─────────────────────────────────────────────────────────────

function CharterCard({ charter, onClick }: { charter: CharterWithUser; onClick: () => void }) {
  const preview = CHARTER_SECTIONS
    .map(s => stripHtml(charter.content[s.key] ?? ''))
    .find(t => t.length > 0) ?? ''

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '148px', flexShrink: 0, textAlign: 'left',
        borderRadius: '10px',
        border: '1.5px solid rgba(37,99,235,0.35)',
        background: 'rgba(37,99,235,0.04)',
        padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: '4px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(37,99,235,0.10)'
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--blue-600)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(37,99,235,0.04)'
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(37,99,235,0.35)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--blue-600)', background: 'rgba(37,99,235,0.12)', padding: '1px 5px', borderRadius: '4px' }}>
          과제정의서
        </span>
      </div>
      <p style={{
        fontSize: '12px', fontWeight: 600, margin: 0,
        color: 'var(--text-primary)', lineHeight: 1.35,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {charter.project_name || '(제목 없음)'}
      </p>
      {preview && (
        <p style={{
          fontSize: '10px', margin: 0,
          color: 'var(--text-secondary)', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {preview}
        </p>
      )}
      <p style={{ fontSize: '10px', margin: '2px 0 0', color: 'var(--text-disabled)' }}>
        {new Date(charter.submitted_at).toLocaleDateString('ko-KR')}
      </p>
    </button>
  )
}

// ─── Charter side panel ───────────────────────────────────────────────────────

function CharterPanel({ charter, onClose }: { charter: CharterWithUser; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.25)',
        }}
      />
      {/* Panel */}
      <div
        ref={ref}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '480px', zIndex: 201,
          background: 'var(--surface-primary)',
          borderLeft: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-secondary)', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '16px', color: 'var(--text-secondary)', padding: '2px 6px',
              borderRadius: '6px', lineHeight: 1,
            }}
          >
            ✕
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--blue-600)', background: 'rgba(37,99,235,0.12)', padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                과제정의서
              </span>
              {charter.homework_id && (
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  과제 #{String(charter.homework_id).padStart(2, '0')}
                </span>
              )}
            </div>
            <p style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {charter.project_name || '(제목 없음)'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <UserAvatar user={charter.users} size={24} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{charter.users.name}</span>
          </div>
        </div>

        {/* Meta */}
        <div style={{
          padding: '8px 18px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', gap: '16px', flexShrink: 0, background: 'var(--surface-secondary)',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
            제출: {new Date(charter.submitted_at).toLocaleString('ko-KR')}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>
            수정: {new Date(charter.updated_at).toLocaleString('ko-KR')}
          </span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {CHARTER_SECTIONS.map(({ key, label }) => {
              const html = charter.content[key] ?? ''
              const text = stripHtml(html)
              return (
                <div key={key}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 6px 0', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    {label}
                  </p>
                  {text ? (
                    <div
                      style={{
                        fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.65,
                        background: 'var(--surface-secondary)', borderRadius: '8px', padding: '10px 14px',
                        border: '1px solid var(--border-subtle)',
                      }}
                      dangerouslySetInnerHTML={{ __html: html || '' }}
                    />
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--text-disabled)', fontStyle: 'italic', margin: 0 }}>
                      (내용 없음)
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── View by User ─────────────────────────────────────────────────────────────

function HomeworkGroup({
  hwId, hwTitle, milestones, charters, onCharterClick,
}: {
  hwId: number | null
  hwTitle: string | null
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {
  const overdueCount = milestones.filter(isOverdue).length
  const label = hwId !== null ? `과제 #${String(hwId).padStart(2, '0')}${hwTitle ? ` — ${hwTitle}` : ''}` : '독립 WBS'

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>{label}</span>
        {overdueCount > 0 && <span style={{ fontSize: '10px', fontWeight: 600, color: '#f87171' }}>⚠️ {overdueCount}건 지연</span>}
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {charters.map(c => (
          <CharterCard key={c.id} charter={c} onClick={() => onCharterClick(c)} />
        ))}
        {milestones.map(m => <MilestoneCard key={m.id} m={m} />)}
      </div>
    </div>
  )
}

function ChampionSection({
  user, milestones, charters, onCharterClick,
}: {
  user: User
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {
  const overdueCount = milestones.filter(isOverdue).length

  const groups = useMemo(() => {
    const keys = new Set<string>()
    for (const m of milestones) keys.add(m.homework_id !== null ? String(m.homework_id) : '__none__')
    for (const c of charters) keys.add(c.homework_id !== null ? String(c.homework_id) : '__none__')

    return Array.from(keys).sort((a, b) => {
      if (a === '__none__') return 1
      if (b === '__none__') return -1
      return Number(a) - Number(b)
    })
  }, [milestones, charters])

  return (
    <div style={{
      borderRadius: '16px',
      border: overdueCount > 0 ? '1.5px solid rgba(248,113,113,0.35)' : '1px solid var(--border-subtle)',
      background: 'var(--surface-primary)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
        background: overdueCount > 0 ? 'rgba(248,113,113,0.04)' : 'var(--surface-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <UserAvatar user={user} />
        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', flex: 1, margin: 0 }}>{user.name}</p>
        <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>{milestones.length}개 마일스톤</span>
        {charters.length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--blue-600)', fontWeight: 600 }}>
            📋 {charters.length}개 과제정의서
          </span>
        )}
        <OverdueBadge count={overdueCount} />
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        {groups.map(key => {
          const hwId = key === '__none__' ? null : Number(key)
          const groupMilestones = milestones.filter(m => (m.homework_id !== null ? String(m.homework_id) : '__none__') === key)
          const groupCharters = charters.filter(c => (c.homework_id !== null ? String(c.homework_id) : '__none__') === key)
          const hwTitle = groupMilestones[0]?.homeworks?.title ?? null
          return (
            <HomeworkGroup
              key={key}
              hwId={hwId}
              hwTitle={hwTitle}
              milestones={groupMilestones}
              charters={groupCharters}
              onCharterClick={onCharterClick}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── View by Homework ─────────────────────────────────────────────────────────

function UserSubSection({
  user, milestones, charters, onCharterClick,
}: {
  user: User
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {
  const overdueCount = milestones.filter(isOverdue).length

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <UserAvatar user={user} size={22} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</span>
        <OverdueBadge count={overdueCount} />
        <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: '10px', color: 'var(--text-disabled)', flexShrink: 0 }}>{milestones.length}개 마일스톤</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingLeft: '30px' }}>
        {charters.map(c => (
          <CharterCard key={c.id} charter={c} onClick={() => onCharterClick(c)} />
        ))}
        {milestones.map(m => <MilestoneCard key={m.id} m={m} />)}
      </div>
    </div>
  )
}

function HomeworkSection({
  hwId, hwTitle, milestones, charters, onCharterClick,
}: {
  hwId: number | null
  hwTitle: string | null
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {
  const overdueCount = milestones.filter(isOverdue).length
  const label = hwId !== null ? `과제 #${String(hwId).padStart(2, '0')}${hwTitle ? ` — ${hwTitle}` : ''}` : '독립 WBS'

  const byUser = useMemo(() => {
    const userMap = new Map<string, { user: User; milestones: MilestoneWithUser[]; charters: CharterWithUser[] }>()
    for (const m of milestones) {
      if (!userMap.has(m.user_id)) userMap.set(m.user_id, { user: m.users, milestones: [], charters: [] })
      userMap.get(m.user_id)!.milestones.push(m)
    }
    for (const c of charters) {
      if (!userMap.has(c.user_id)) userMap.set(c.user_id, { user: c.users, milestones: [], charters: [] })
      userMap.get(c.user_id)!.charters.push(c)
    }
    return Array.from(userMap.values())
  }, [milestones, charters])

  return (
    <div style={{
      borderRadius: '16px',
      border: overdueCount > 0 ? '1.5px solid rgba(248,113,113,0.35)' : '1px solid var(--border-subtle)',
      background: 'var(--surface-primary)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
        background: overdueCount > 0 ? 'rgba(248,113,113,0.04)' : 'var(--surface-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', flex: 1, margin: 0 }}>{label}</p>
        <span style={{ fontSize: '11px', color: 'var(--text-disabled)' }}>{byUser.length}명 참여</span>
        <OverdueBadge count={overdueCount} />
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        {byUser.map(({ user, milestones: ums, charters: ucs }) => (
          <UserSubSection key={user.id} user={user} milestones={ums} charters={ucs} onCharterClick={onCharterClick} />
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminProgressPage() {
  const [milestones, setMilestones] = useState<MilestoneWithUser[]>([])
  const [charters, setCharters] = useState<CharterWithUser[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('user')
  const [selectedCharter, setSelectedCharter] = useState<CharterWithUser | null>(null)

  useEffect(() => {
    apiFetch<MilestoneWithUser[]>('/api/admin/milestones').then(data => {
      setMilestones(data)
      setSelectedUsers(new Set(data.map(m => m.user_id)))
    }).catch((e: Error) => toast.error('진행 현황 로드 실패: ' + e.message))
    apiFetch<CharterWithUser[]>('/api/admin/charters').then(setCharters)
      .catch((e: Error) => toast.error('진행 현황 로드 실패: ' + e.message))
  }, [])

  const users = useMemo(
    () => Array.from(new Map(milestones.map(m => [m.user_id, m.users])).values()),
    [milestones],
  )

  const filtered = useMemo(
    () => milestones.filter(m => selectedUsers.has(m.user_id)),
    [milestones, selectedUsers],
  )

  const filteredCharters = useMemo(
    () => charters.filter(c => selectedUsers.has(c.user_id)),
    [charters, selectedUsers],
  )

  const byUser = useMemo(
    () => users.filter(u => selectedUsers.has(u.id)).map(u => ({
      user: u,
      milestones: filtered.filter(m => m.user_id === u.id),
      charters: filteredCharters.filter(c => c.user_id === u.id),
    })),
    [users, filtered, filteredCharters, selectedUsers],
  )

  const byHomework = useMemo(() => {
    const map = new Map<string, { hwId: number | null; hwTitle: string | null; milestones: MilestoneWithUser[]; charters: CharterWithUser[] }>()
    for (const m of filtered) {
      const key = m.homework_id !== null ? String(m.homework_id) : '__none__'
      if (!map.has(key)) map.set(key, { hwId: m.homework_id, hwTitle: m.homeworks?.title ?? null, milestones: [], charters: [] })
      map.get(key)!.milestones.push(m)
    }
    for (const c of filteredCharters) {
      const key = c.homework_id !== null ? String(c.homework_id) : '__none__'
      if (!map.has(key)) map.set(key, { hwId: c.homework_id, hwTitle: null, milestones: [], charters: [] })
      map.get(key)!.charters.push(c)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => { if (a === '__none__') return 1; if (b === '__none__') return -1; return Number(a) - Number(b) })
      .map(([key, g]) => ({ key, ...g }))
  }, [filtered, filteredCharters])

  function toggleUser(userId: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
          챔피언 진척도 비교
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>오늘: {todayStr}</p>
      </div>

      {/* View mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' }}>
        <div style={{
          display: 'inline-flex', borderRadius: '10px', overflow: 'hidden',
          border: '1px solid var(--border-subtle)', background: 'var(--surface-secondary)',
        }}>
          {([['user', '챔피언별'], ['homework', '과제별']] as [ViewMode, string][]).map(([mode, label]) => {
            const active = viewMode === mode
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '6px 16px', fontSize: '12px', fontWeight: active ? 700 : 400,
                  border: 'none', cursor: 'pointer',
                  background: active ? 'var(--blue-600)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Champion filter chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {users.map(u => {
            const active = selectedUsers.has(u.id)
            return (
              <label key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                cursor: 'pointer', padding: '5px 12px', borderRadius: '20px',
                border: `1px solid ${active ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
                background: active ? 'rgba(37,99,235,0.1)' : 'var(--surface-primary)',
                color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
                fontSize: '12px', fontWeight: active ? 600 : 400, userSelect: 'none',
              }}>
                <input type="checkbox" checked={active} onChange={() => toggleUser(u.id)} style={{ display: 'none' }} />
                {u.avatar_url && <img src={u.avatar_url} style={{ width: 16, height: 16, borderRadius: '50%' }} alt="" />}
                {u.name}
              </label>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {viewMode === 'user' ? (
          byUser.length > 0
            ? byUser.map(({ user, milestones: ums, charters: ucs }) => (
                <ChampionSection
                  key={user.id}
                  user={user}
                  milestones={ums}
                  charters={ucs}
                  onCharterClick={setSelectedCharter}
                />
              ))
            : <p style={{ color: 'var(--text-disabled)', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>표시할 챔피언이 없습니다.</p>
        ) : (
          byHomework.length > 0
            ? byHomework.map(({ key, hwId, hwTitle, milestones: hms, charters: hcs }) => (
                <HomeworkSection key={key} hwId={hwId} hwTitle={hwTitle} milestones={hms} charters={hcs} onCharterClick={setSelectedCharter} />
              ))
            : <p style={{ color: 'var(--text-disabled)', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>표시할 데이터가 없습니다.</p>
        )}
      </div>

      {/* Charter side panel */}
      {selectedCharter && (
        <CharterPanel charter={selectedCharter} onClose={() => setSelectedCharter(null)} />
      )}
    </div>
  )
}
