'use client'
import type { CSSProperties } from 'react'
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
  label: string
  tone: Tone
  onClick?: () => void
}

const TONE_STYLE: Record<Tone, CSSProperties> = {
  'next-accent': { background: 'var(--background)', color: 'var(--accent)' },
  'next-success': { background: 'var(--background)', color: 'var(--success)' },
  'fill-accent': { background: 'var(--accent)', color: '#fff' },
  'fill-success': { background: 'var(--success)', color: '#fff' },
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
  const segments: Segment[] =
    stage === 'not_started'
      ? [
          { label: '▶ 시작', tone: 'next-accent', onClick: onStart },
          { label: '진행중', tone: 'off' },
          { label: '완료', tone: 'off' },
        ]
      : stage === 'in_progress'
        ? [
            { label: '✓ 시작', tone: 'done' },
            { label: '진행중', tone: 'fill-accent' },
            { label: '완료로', tone: 'next-success', onClick: onComplete },
          ]
        : [
            { label: '✓ 시작', tone: 'done' },
            { label: '✓ 진행중', tone: 'done' },
            { label: '✓ 완료', tone: 'fill-success' },
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
        overflow: 'hidden',
        background: 'var(--background)',
        height: size === 'md' ? 34 : 30,
        width: size === 'md' ? '100%' : 216,
      }}
    >
      {segments.map((seg, i) => {
        const clickable = !!seg.onClick && !disabled && !busy
        return (
          <button
            key={i}
            type="button"
            disabled={!clickable}
            onClick={seg.onClick}
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: clickable ? 'pointer' : 'default',
              transition: 'background 0.15s, color 0.15s',
              ...TONE_STYLE[seg.tone],
            }}
          >
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}
