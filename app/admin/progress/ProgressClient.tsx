'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Milestone, User } from '@/lib/types'

type MilestoneWithUser = Milestone & { users: User }

type CharterContent = {
  summary?: string
  problem?: string
  user?: string
  goal?: string
  solution?: string
  build?: string
  timeline?: string
  closing?: string
  [key: string]: string | undefined
}
type CharterWithUser = {
  id: string
  user_id: string
  project_name: string | null
  content: CharterContent
  submitted_at: string
  updated_at: string
  admin_approved_at: string | null
  users: User
}

const CHARTER_SECTIONS: { key: string; label: string }[] = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
]

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연 / 미완료',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--amber)', completed: 'var(--success)', delayed: 'var(--error)',
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
  return !!m.due_date && new Date(m.due_date).getTime() < todayMs && m.status !== 'completed'
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
  const days = daysFromToday(m.due_date ?? '')
  const urgent = !overdue && m.status !== 'completed' && days <= 3

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '6px' }}>
      <p style={{ fontSize: '10px', margin: 0, color: overdue ? 'var(--error)' : 'var(--text-disabled)', fontWeight: overdue ? 700 : 400 }}>
        마감 {m.due_date ?? ''}
      </p>
      {m.status !== 'completed' && (
        <p style={{ fontSize: '11px', fontWeight: 700, margin: 0, color: overdue ? 'var(--error)' : urgent ? 'var(--amber)' : 'var(--text-disabled)' }}>
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
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'rgba(248,113,113,0.15)', color: 'var(--error)' }}>
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


// ─── Champion section (user view) ─────────────────────────────────────────────

function ChampionSection({
  user, milestones, charters, onCharterClick,
}: {
  user: User
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {
  const overdueCount = milestones.filter(isOverdue).length

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
      <div style={{ padding: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {charters.map(c => (
          <CharterCard key={c.id} charter={c} onClick={() => onCharterClick(c)} />
        ))}
        {milestones.map(m => <MilestoneCard key={m.id} m={m} />)}
      </div>
    </div>
  )
}

// ─── Client Component ─────────────────────────────────────────────────────────

interface ClientProps {
  initialMilestones: MilestoneWithUser[]
  initialCharters: CharterWithUser[]
}

export function ProgressClient({ initialMilestones, initialCharters }: ClientProps) {
  const [milestones] = useState(initialMilestones)
  const [charters, setCharters] = useState(initialCharters)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set(initialMilestones.map(m => m.user_id)))

  // popup에서 승인 완료 시 postMessage로 상태 동기화
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'charter_approved') {
        const { charterId, approvedAt } = e.data as { charterId: string; approvedAt: string }
        setCharters(prev => prev.map(c => c.id === charterId ? { ...c, admin_approved_at: approvedAt } : c))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
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

  function toggleUser(userId: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function openCharterPopup(charter: CharterWithUser) {
    window.open(
      `/charter-popup/${charter.id}`,
      `charter-popup-${charter.id}`,
      'width=800,height=920,resizable=yes,scrollbars=yes',
    )
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

      {/* Champion filter chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
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

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {byUser.length > 0
          ? byUser.map(({ user, milestones: ums, charters: ucs }) => (
              <ChampionSection
                key={user.id}
                user={user}
                milestones={ums}
                charters={ucs}
                onCharterClick={openCharterPopup}
              />
            ))
          : <p style={{ color: 'var(--text-disabled)', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>표시할 챔피언이 없습니다.</p>
        }
      </div>
    </div>
  )
}
