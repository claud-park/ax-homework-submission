'use client'
import { useId, type CSSProperties } from 'react'
import type { Stage } from '@/lib/milestone-view'

export interface StageStepperProps {
  stage: Stage
  disabled?: boolean
  disabledReason?: string
  size?: 'sm' | 'md'
  busy?: boolean
  onStart: () => void
  onComplete: () => void
}

type Tone = 'next-accent' | 'next-success' | 'fill-accent' | 'fill-success' | 'done' | 'off'

interface Segment {
  glyph?: '▶' | '✓'
  label: string
  tone: Tone
  onClick?: () => void
  current?: boolean
}

const TONE_STYLE: Record<Tone, CSSProperties> = {
  'next-accent': { background: 'var(--background)', color: 'var(--accent)' },
  'next-success': { background: 'var(--background)', color: 'var(--success)' },
  'fill-accent': { background: 'var(--accent)', color: 'var(--text-inverse)' },
  'fill-success': { background: 'var(--success)', color: 'var(--text-inverse)' },
  done: { background: 'var(--surface-minimal)', color: 'var(--text-disabled)' },
  off: { background: 'var(--background)', color: 'var(--text-disabled)' },
}

export function StageStepper({
  stage,
  disabled = false,
  disabledReason,
  size = 'sm',
  busy = false,
  onStart,
  onComplete,
}: StageStepperProps) {
  const reasonId = useId()
  const showReason = disabled && !!disabledReason
  const segments: Segment[] =
    stage === 'not_started'
      ? [
          { glyph: '▶', label: '시작', tone: 'next-accent', onClick: onStart },
          { label: '진행중', tone: 'off' },
          { label: '완료', tone: 'off' },
        ]
      : stage === 'in_progress'
        ? [
            { glyph: '✓', label: '시작', tone: 'done' },
            { label: '진행중', tone: 'fill-accent', current: true },
            { label: '완료로', tone: 'next-success', onClick: onComplete },
          ]
        : [
            { glyph: '✓', label: '시작', tone: 'done' },
            { glyph: '✓', label: '진행중', tone: 'done' },
            { glyph: '✓', label: '완료', tone: 'fill-success', current: true },
          ]

  return (
    <div
      role="group"
      aria-label="진행 단계"
      title={disabled ? disabledReason : undefined}
      style={{
        display: 'flex',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--background)',
        height: size === 'md' ? 34 : 30,
        width: size === 'md' ? '100%' : 216,
      }}
    >
      {showReason && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
      {segments.map((seg, i) => {
        const clickable = !!seg.onClick && !disabled && !busy
        return (
          <button
            key={i}
            type="button"
            disabled={!clickable}
            onClick={seg.onClick}
            aria-current={seg.current ? 'step' : undefined}
            aria-describedby={showReason ? reasonId : undefined}
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderRadius: i === 0 ? '7px 0 0 7px' : i === 2 ? '0 7px 7px 0' : 0,
              outlineOffset: -2,
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: clickable ? 'pointer' : 'default',
              transition: 'background 0.15s, color 0.15s',
              ...TONE_STYLE[seg.tone],
            }}
          >
            {seg.glyph && <span aria-hidden="true">{seg.glyph} </span>}
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}
