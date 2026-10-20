import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MilestoneSummary } from '@/components/milestones/MilestoneSummary'
import type { ViewSummary } from '@/lib/milestone-view'

const summary: ViewSummary = { total: 10, done: 4, prog: 3, over: 1, not: 2, pending: 2, thisWeek: 3 }
const empty: ViewSummary = { total: 0, done: 0, prog: 0, over: 0, not: 0, pending: 0, thisWeek: 0 }

describe('MilestoneSummary', () => {
  it('calls onFilterChange with over when the 지연 chip is clicked', () => {
    const onFilterChange = vi.fn()
    render(<MilestoneSummary summary={summary} todayStr="2026-10-20" filter="all" onFilterChange={onFilterChange} />)
    fireEvent.click(screen.getByRole('button', { name: '지연 1' }))
    expect(onFilterChange).toHaveBeenCalledWith('over')
  })

  it('sets aria-pressed only on the current filter chip', () => {
    render(<MilestoneSummary summary={summary} todayStr="2026-10-20" filter="prog" onFilterChange={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(5)
    const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed.map((b) => b.textContent)).toEqual(['진행중 3'])
  })

  it('renders 0% without NaN when total is 0', () => {
    const { container } = render(<MilestoneSummary summary={empty} todayStr="2026-10-20" filter="all" onFilterChange={() => {}} />)
    const bar = screen.getByRole('img', { name: '전체 진행률 0%' })
    const widths = Array.from(bar.children).map((c) => (c as HTMLElement).style.width)
    expect(widths).toEqual(['0%', '0%', '0%'])
    expect(container.textContent).not.toContain('NaN')
  })

  it('renders segment widths proportional to counts', () => {
    render(<MilestoneSummary summary={summary} todayStr="2026-10-20" filter="all" onFilterChange={() => {}} />)
    const bar = screen.getByRole('img', { name: '전체 진행률 40%' })
    expect(Array.from(bar.children).map((c) => (c as HTMLElement).style.width)).toEqual(['40%', '30%', '10%'])
  })

  it('renders the weekday for 2026-10-20 as (화)', () => {
    render(<MilestoneSummary summary={summary} todayStr="2026-10-20" filter="all" onFilterChange={() => {}} />)
    expect(screen.getByText(/오늘 2026-10-20 \(화\)/)).toBeTruthy()
  })
})
