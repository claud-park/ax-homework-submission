'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Milestone } from '@/lib/types'
import { deriveStage, dueBadge, fmtRange, isIssuePending, isScheduleDelayed } from '@/lib/milestone-view'
import { StageStepper } from '@/components/milestones/StageStepper'
import MilestoneActivityLogToggle from '@/components/milestones/MilestoneActivityLogToggle'

export interface MilestoneRowProps {
  m: Milestone
  todayStr: string
  charterApproved: boolean
  busy?: boolean
  onStart: (id: string) => void
  onComplete: (id: string) => void
  onIssueClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  onNoteUpdate: (id: string, note: string | null) => Promise<void>
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

const BADGE_STYLE: Record<'ok' | 'soon' | 'over' | 'muted', CSSProperties> = {
  ok: { color: 'var(--text-secondary)', background: 'var(--surface-primary)' },
  soon: { color: 'var(--amber)', background: 'rgba(217,119,6,0.12)' },
  over: { color: 'var(--text-inverse)', background: 'var(--error)' },
  muted: { color: 'var(--text-tertiary)', background: 'var(--surface-primary)' },
}

const CHIP_STYLE: CSSProperties = {
  fontSize: 11, background: 'var(--surface-primary)', color: 'var(--text-secondary)',
  borderRadius: 4, padding: '1px 6px', flexShrink: 0,
}

const LINK_STYLE: CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)',
  cursor: 'pointer', textDecoration: 'underline',
}

export function MilestoneRow({
  m, todayStr, charterApproved, busy, onStart, onComplete, onIssueClick, onDeadlineExtension, onNoteUpdate,
}: MilestoneRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [logCount, setLogCount] = useState<number | null>(null)
  const [noteEditing, setNoteEditing] = useState(false)
  const [noteValue, setNoteValue] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  const stage = deriveStage(m)
  const completed = stage === 'completed'
  const delayed = isScheduleDelayed(m, todayStr)
  const pending = isIssuePending(m)
  const badge = dueBadge(m, todayStr)
  const canEditNote = stage === 'in_progress'
  const hasAdminReply = !!m.bottleneck_reviewed_at && !!m.bottleneck_admin_comment
  const isReschedule = !!m.start_date && m.start_date < todayStr && stage === 'not_started'
  const deadlineLabel = !m.due_date ? '기한 설정' : isReschedule ? '기한 변경' : '기한 연장'
  const deadlineReschedule = !!m.due_date && isReschedule
  const showIssueReport = delayed && !pending

  const railColor = completed ? 'var(--success)'
    : delayed ? 'var(--error)'
    : stage === 'in_progress' ? 'var(--accent)'
    : 'var(--accent-disabled)'

  useEffect(() => {
    setNoteEditing(false)
    setNoteValue('')
  }, [m.id])

  function openNoteEdit() {
    setNoteValue(m.note ?? '')
    setNoteEditing(true)
  }

  async function handleNoteSave() {
    const trimmed = noteValue.trim()
    const next = trimmed === '' ? null : trimmed
    if (next === (m.note ?? null)) { setNoteEditing(false); return }
    setNoteSaving(true)
    try {
      await onNoteUpdate(m.id, next)
      setNoteEditing(false)
    } catch {
      // keep the editor open with the draft; the parent surfaces the error
    } finally {
      setNoteSaving(false)
    }
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNoteSave() }
    if (e.key === 'Escape') { setNoteEditing(false) }
  }

  const issueBtnHeight = 30

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '4px minmax(0,1fr) 168px 256px 32px',
          columnGap: 12,
          alignItems: 'center',
          minHeight: 46,
          padding: '0 10px 0 8px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ width: 4, height: 26, borderRadius: 2, background: railColor }} />

        <div className="flex items-center gap-2 min-w-0">
          <span
            className="truncate"
            style={{
              fontSize: 14, fontWeight: 500,
              color: completed ? 'var(--text-secondary)' : 'var(--text-primary)',
              textDecoration: completed ? 'line-through' : 'none',
            }}
          >
            {m.title}
          </span>
          {m.note && <span style={CHIP_STYLE}>노트</span>}
          {logCount !== null && <span style={CHIP_STYLE}>로그 {logCount}</span>}
        </div>

        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12, color: delayed ? 'var(--error)' : 'var(--text-secondary)' }}>
            {fmtRange(m)}
          </span>
          {badge ? (
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 6px', ...BADGE_STYLE[badge.tone] }}>
              {badge.label}
            </span>
          ) : !completed ? (
            <button type="button" className="text-xs" style={LINK_STYLE} onClick={() => onDeadlineExtension(m, false)}>
              기한 설정
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          {showIssueReport && (
            <button
              type="button"
              onClick={() => onIssueClick(m)}
              className="text-xs font-semibold px-3"
              style={{ height: issueBtnHeight, borderRadius: 8, border: '1px solid var(--error)', color: 'var(--error)', background: 'transparent' }}
            >
              이슈 보고
            </button>
          )}
          {pending && !completed && (
            <span
              className="text-xs font-semibold px-3 inline-flex items-center"
              style={{
                height: issueBtnHeight, borderRadius: 8, color: 'var(--error)',
                background: 'rgba(229,23,47,0.06)', border: '1px solid rgba(229,23,47,0.3)',
              }}
            >
              이슈 검토중
            </span>
          )}
          <StageStepper
            stage={stage}
            size="sm"
            busy={busy}
            disabled={!charterApproved}
            disabledReason="과제정의서 승인 후 진행할 수 있습니다"
            onStart={() => onStart(m.id)}
            onComplete={() => onComplete(m.id)}
          />
        </div>

        <button
          type="button"
          aria-label={expanded ? '상세 접기' : '상세 펼치기'}
          aria-expanded={expanded}
          onClick={() => setExpanded(e => !e)}
          className="inline-flex items-center justify-center"
          style={{ width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          <ChevronDown
            size={16}
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
          />
        </button>
      </div>

      {expanded && (
        <div
          className="grid grid-cols-2 gap-6"
          style={{
            padding: '12px 16px 16px 24px',
            background: 'var(--surface-minimal)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex flex-col gap-2 min-w-0">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>진행 노트</span>
            {noteEditing ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  autoFocus
                  value={noteValue}
                  onChange={e => setNoteValue(e.target.value)}
                  onKeyDown={handleNoteKeyDown}
                  placeholder="진행 상황을 간단히 메모해주세요"
                  rows={2}
                  style={{
                    background: 'var(--background)', border: '1px solid var(--blue-600)', borderRadius: 6,
                    color: 'var(--text-primary)', padding: '7px 10px', fontSize: 12, resize: 'none',
                    width: '100%', outline: 'none',
                  }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleNoteSave}
                    disabled={noteSaving}
                    className="text-xs px-3 py-1 rounded-md font-semibold"
                    style={{ background: 'var(--blue-600)', color: '#fff', opacity: noteSaving ? 0.7 : 1 }}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteEditing(false)}
                    className="text-xs px-3 py-1 rounded-md"
                    style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p
                className="text-xs"
                style={{
                  color: m.note ? 'var(--text-secondary)' : 'var(--text-disabled)',
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}
              >
                {m.note || '아직 진행 노트가 없습니다.'}
              </p>
            )}

            {hasAdminReply && (
              <div
                style={{
                  borderLeft: '3px solid var(--blue-600)',
                  borderRadius: '0 6px 6px 0',
                  background: 'rgba(37,99,235,0.04)',
                  padding: '8px 10px 8px 12px',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)' }}
                  >
                    관리자
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                    {timeAgo(m.bottleneck_reviewed_at!)}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {m.bottleneck_admin_comment}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs">
              {canEditNote && !noteEditing && (
                <button type="button" style={LINK_STYLE} onClick={openNoteEdit}>노트 편집</button>
              )}
              {!completed && (
                <button type="button" style={LINK_STYLE} onClick={() => onDeadlineExtension(m, deadlineReschedule)}>
                  {deadlineLabel}
                </button>
              )}
              {showIssueReport && (
                <button type="button" style={{ ...LINK_STYLE, color: 'var(--error)' }} onClick={() => onIssueClick(m)}>
                  이슈 보고 / 도움 요청
                </button>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <MilestoneActivityLogToggle milestoneId={m.id} defaultExpanded onLoaded={setLogCount} />
          </div>
        </div>
      )}
    </div>
  )
}
