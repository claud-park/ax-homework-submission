'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { deriveStage, fmtRange, isIssuePending, isScheduleDelayed } from '@/lib/milestone-view'
import { StageStepper } from '@/components/milestones/StageStepper'
import { useNoteEditor } from '@/components/milestones/useNoteEditor'
import {
  CHIP_STYLE, DueBadge, MilestoneDetailPanel, railColorOf, type MilestoneRowProps,
} from '@/components/milestones/MilestoneRow'

export type MobileMilestoneCardProps = MilestoneRowProps

export function MobileMilestoneCard({
  m, todayStr, charterApproved, busy, onStart, onComplete, onIssueClick, onDeadlineExtension, onNoteUpdate,
}: MobileMilestoneCardProps) {
  const [expanded, setExpanded] = useState(false)
  const noteEditor = useNoteEditor(m, onNoteUpdate)

  const stage = deriveStage(m)
  const completed = stage === 'completed'
  const delayed = isScheduleDelayed(m, todayStr)
  const pending = isIssuePending(m)
  const showIssueReport = delayed && !pending

  return (
    <div
      style={{
        background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '4px minmax(0,1fr)' }}>
        <span style={{ background: railColorOf(stage, delayed) }} />

        <div className="flex flex-col" style={{ gap: 8, padding: '10px 12px' }}>
          <div className="flex items-start gap-2">
            <span
              className="flex-1 min-w-0"
              style={{
                fontSize: 14, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere',
                color: completed ? 'var(--text-secondary)' : 'var(--text-primary)',
                textDecoration: completed ? 'line-through' : 'none',
              }}
            >
              {m.title}
            </span>
            <button
              type="button"
              aria-label={expanded ? '상세 접기' : '상세 펼치기'}
              aria-expanded={expanded}
              onClick={() => setExpanded(e => !e)}
              className="inline-flex items-center justify-center flex-shrink-0"
              style={{ width: 44, height: 44, margin: '-8px -10px -8px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <ChevronDown
                size={16}
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
              />
            </button>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <span style={{ fontSize: 12, color: delayed ? 'var(--error)' : 'var(--text-secondary)' }}>
              {fmtRange(m)}
            </span>
            <DueBadge m={m} todayStr={todayStr} onDeadlineExtension={onDeadlineExtension} />
            {noteEditor.editing && !expanded && stage === 'in_progress' && <span style={CHIP_STYLE}>노트 편집중</span>}
            {pending && !completed && (
              <span
                className="text-xs font-semibold px-2 inline-flex items-center"
                style={{
                  height: 22, borderRadius: 6, color: 'var(--error)',
                  background: 'rgba(229,23,47,0.06)', border: '1px solid rgba(229,23,47,0.3)',
                }}
              >
                이슈 검토중
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showIssueReport && (
              <button
                type="button"
                onClick={() => onIssueClick(m)}
                className="text-xs font-semibold px-3 flex-shrink-0 whitespace-nowrap"
                style={{ height: 34, borderRadius: 8, border: '1px solid var(--error)', color: 'var(--error)', background: 'transparent' }}
              >
                이슈 보고
              </button>
            )}
            <div className="flex-1 min-w-0">
              <StageStepper
                stage={stage}
                size="md"
                busy={busy}
                disabled={!charterApproved}
                disabledReason="과제정의서 승인 후 진행할 수 있습니다"
                onStart={() => onStart(m.id)}
                onComplete={() => onComplete(m.id)}
              />
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <MilestoneDetailPanel
          m={m} todayStr={todayStr} layout="one"
          onIssueClick={onIssueClick} onDeadlineExtension={onDeadlineExtension} noteEditor={noteEditor}
        />
      )}
    </div>
  )
}
