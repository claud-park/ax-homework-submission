import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import { StageStepper } from '@/components/milestones/StageStepper'

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

describe('StageStepper', () => {
  it('not_started: only 시작 is enabled and calls onStart', () => {
    const onStart = vi.fn(), onComplete = vi.fn()
    render(<StageStepper stage="not_started" onStart={onStart} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /시작/ }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '진행중' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '완료' })).toBeDisabled()
  })

  it('in_progress: 완료로 is enabled, 시작 is disabled', () => {
    const onStart = vi.fn(), onComplete = vi.fn()
    render(<StageStepper stage="in_progress" onStart={onStart} onComplete={onComplete} />)
    expect(screen.getByRole('button', { name: /시작/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '진행중' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '완료로' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('completed: all three disabled', () => {
    render(<StageStepper stage="completed" onStart={vi.fn()} onComplete={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons.every(b => (b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('disabled with reason: group has title, 시작 is aria-disabled, click explains instead of acting', () => {
    const onStart = vi.fn()
    render(<StageStepper stage="not_started" disabled disabledReason="과제정의서 승인 후 진행할 수 있습니다" onStart={onStart} onComplete={vi.fn()} />)
    expect(screen.getByRole('group', { name: '진행 단계' })).toHaveAttribute('title', '과제정의서 승인 후 진행할 수 있습니다')
    const start = screen.getByRole('button', { name: /시작/ })
    expect(start).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(start)
    expect(onStart).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('과제정의서 승인 후 진행할 수 있습니다')
  })

  it('busy: all disabled without title', () => {
    render(<StageStepper stage="in_progress" busy onStart={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getAllByRole('button').every(b => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(screen.getByRole('group', { name: '진행 단계' })).not.toHaveAttribute('title')
  })

  it('glyphs are aria-hidden so accessible names are plain stage labels', () => {
    render(<StageStepper stage="in_progress" onStart={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '완료로' })).toBeInTheDocument()
  })

  it('current stage segment carries aria-current="step"', () => {
    const { rerender } = render(<StageStepper stage="in_progress" onStart={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: '진행중' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: '시작' })).not.toHaveAttribute('aria-current')
    rerender(<StageStepper stage="completed" onStart={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: '완료' })).toHaveAttribute('aria-current', 'step')
    rerender(<StageStepper stage="not_started" onStart={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.queryAllByRole('button').some(b => b.hasAttribute('aria-current'))).toBe(false)
  })

  it("disabled reason is exposed as each button's accessible description", () => {
    render(<StageStepper stage="not_started" disabled disabledReason="과제정의서 승인 후 진행할 수 있습니다" onStart={vi.fn()} onComplete={vi.fn()} />)
    for (const b of screen.getAllByRole('button')) {
      expect(b).toHaveAccessibleDescription('과제정의서 승인 후 진행할 수 있습니다')
    }
  })

  it('enabled stepper has no accessible description and no overflow clipping', () => {
    render(<StageStepper stage="not_started" onStart={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: '시작' })).not.toHaveAttribute('aria-describedby')
    expect(screen.getByRole('group', { name: '진행 단계' }).style.overflow).not.toBe('hidden')
  })
})
