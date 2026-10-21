'use client'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Milestone } from '@/lib/types'
import { deriveStage, dueBadge, fmtRange, isIssuePending, isScheduleDelayed, type Stage } from '@/lib/milestone-view'
import { StageStepper } from '@/components/milestones/StageStepper'
import { useNoteEditor, type NoteEditor } from '@/components/milestones/useNoteEditor'
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

export const CHIP_STYLE: CSSProperties = {
  fontSize: 11, background: 'var(--surface-primary)', color: 'var(--text-secondary)',
  borderRadius: 4, padding: '1px 6px', flexShrink: 0, whiteSpace: 'nowrap',
}

const LINK_STYLE: CSSProperties = {
  background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)',
  cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap',
}

/** D-배지. 기한이 없고 미완료면 '기한 설정' 링크로 대체한다. */
export function DueBadge({ m, todayStr, onDeadlineExtension }: {
  m: Milestone
  todayStr: string
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
}) {
  const badge = dueBadge(m, todayStr)
  if (badge) {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0, ...BADGE_STYLE[badge.tone] }}>
        {badge.label}
      </span>
    )
  }
  if (deriveStage(m) === 'completed') return null
  return (
    <button type="button" className="text-xs" style={LINK_STYLE} onClick={() => onDeadlineExtension(m, false)}>
      기한 설정
    </button>
  )
}

export function railColorOf(stage: Stage, delayed: boolean): string {
  return stage === 'completed' ? 'var(--success)'
    : delayed ? 'var(--error)'
    : stage === 'in_progress' ? 'var(--accent)'
    : 'var(--accent-disabled)'
}

export interface MilestoneDetailPanelProps {
  m: Milestone
  todayStr: string
  layout: 'two' | 'one'
  onIssueClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  noteEditor: NoteEditor
  onLogLoaded?: (count: number) => void
}

/** 펼침 패널(노트·관리자 답변·링크·작업 로그). 데스크톱은 2열, 모바일은 1열. */
export function MilestoneDetailPanel({
  m, todayStr, layout, onIssueClick, onDeadlineExtension, noteEditor, onLogLoaded,
}: MilestoneDetailPanelProps) {
  const stage = deriveStage(m)
  const completed = stage === 'completed'
  const canEditNote = stage === 'in_progress'
  const hasAdminReply = !!m.bottleneck_reviewed_at && !!m.bottleneck_admin_comment
  const isReschedule = !!m.start_date && m.start_date < todayStr && stage === 'not_started'
  const deadlineLabel = !m.due_date ? '기한 설정' : isReschedule ? '기한 변경' : '기한 연장'
  const deadlineReschedule = !!m.due_date && isReschedule
  const showIssueReport = isScheduleDelayed(m, todayStr) && !isIssuePending(m)

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); noteEditor.save() }
    if (e.key === 'Escape') { noteEditor.cancel() }
  }

  return (
    <div
      className={layout === 'two' ? 'grid grid-cols-2 gap-6' : 'flex flex-col gap-4'}
      style={{
        padding: layout === 'two' ? '12px 16px 16px 24px' : '12px 14px 14px',
        background: 'var(--surface-minimal)',
        borderBottom: layout === 'two' ? '1px solid var(--border-subtle)' : undefined,
      }}
    >
    <div className="flex flex-col gap-2 min-w-0">
      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>진행 노트</span>
      {canEditNote && noteEditor.editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            autoFocus
            value={noteEditor.value}
            onChange={e => noteEditor.setValue(e.target.value)}
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
              onClick={noteEditor.save}
              disabled={noteEditor.saving}
              className="text-xs px-3 py-1 rounded-md font-semibold"
              style={{ background: 'var(--blue-600)', color: 'var(--text-inverse)', opacity: noteEditor.saving ? 0.7 : 1 }}
            >
              저장
            </button>
            <button
              type="button"
              onClick={noteEditor.cancel}
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
        {canEditNote && !noteEditor.editing && (
          <button type="button" style={LINK_STYLE} onClick={noteEditor.open}>노트 편집</button>
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
      <MilestoneActivityLogToggle milestoneId={m.id} defaultExpanded onLoaded={onLogLoaded} />
    </div>
    </div>
  )
}

export function MilestoneRow({
  m, todayStr, charterApproved, busy, onStart, onComplete, onIssueClick, onDeadlineExtension, onNoteUpdate,
}: MilestoneRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [logCount, setLogCount] = useState<number | null>(null)
  const noteEditor = useNoteEditor(m, onNoteUpdate)

  const stage = deriveStage(m)
  const completed = stage === 'completed'
  const delayed = isScheduleDelayed(m, todayStr)
  const pending = isIssuePending(m)
  const showIssueReport = delayed && !pending

  const railColor = railColorOf(stage, delayed)

  const issueBtnHeight = 30

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '4px 32px minmax(0,1fr) 168px 256px',
          columnGap: 12,
          alignItems: 'center',
          minHeight: 46,
          padding: '0 10px 0 8px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ width: 4, height: 26, borderRadius: 2, background: railColor }} />

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
          {noteEditor.editing && !expanded && stage === 'in_progress' && <span style={CHIP_STYLE}>노트 편집중</span>}
        </div>

        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12, color: delayed ? 'var(--error)' : 'var(--text-secondary)' }}>
            {fmtRange(m)}
          </span>
          <DueBadge m={m} todayStr={todayStr} onDeadlineExtension={onDeadlineExtension} />
        </div>

        <div className="flex items-center justify-end gap-2">
          {showIssueReport && (
            <button
              type="button"
              onClick={() => onIssueClick(m)}
              className="text-xs font-semibold px-3 whitespace-nowrap flex-shrink-0"
              style={{ height: issueBtnHeight, borderRadius: 8, border: '1px solid var(--error)', color: 'var(--error)', background: 'transparent' }}
            >
              이슈 보고
            </button>
          )}
          {pending && !completed && (
            <span
              className="text-xs font-semibold px-3 inline-flex items-center whitespace-nowrap flex-shrink-0"
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
      </div>

      {expanded && (
        <MilestoneDetailPanel
          m={m} todayStr={todayStr} layout="two"
          onIssueClick={onIssueClick} onDeadlineExtension={onDeadlineExtension}
          noteEditor={noteEditor} onLogLoaded={setLogCount}
        />
      )}
    </div>
  )
}
