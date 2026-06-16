import { vi } from 'vitest'

// Mock api-client before it loads — it instantiates Supabase browser client at module load,
// which throws in jsdom without env vars.
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(() => Promise.resolve({ milestones: [] })) }))

// sonner may not work in jsdom — stub it.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// DateRangePicker calls fetch on mount (holiday API); stub it harmlessly.
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as any)

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MilestoneDraftDrawer from '@/components/milestones/MilestoneDraftDrawer'

describe('MilestoneDraftDrawer', () => {
  it('renders the three method tabs when open', () => {
    render(<MilestoneDraftDrawer open onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('AI로 생성')).toBeInTheDocument()
    expect(screen.getByText('템플릿에서')).toBeInTheDocument()
    expect(screen.getByText('직접 입력')).toBeInTheDocument()
  })

  it('direct tab adds an empty draft row and disables save until a title exists', () => {
    render(<MilestoneDraftDrawer open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('직접 입력'))
    fireEvent.click(screen.getByText('+ 행 추가'))
    const saveBtn = screen.getByRole('button', { name: /저장/ })
    expect(saveBtn).toBeDisabled()
  })

  it('shows the refine bar only after a draft exists, with refine disabled until an instruction is typed', () => {
    render(<MilestoneDraftDrawer open onClose={() => {}} onSaved={() => {}} />)
    expect(screen.queryByPlaceholderText('수정 요청 (예: 베타를 2주로 늘려줘)')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('템플릿에서'))
    fireEvent.click(screen.getByText('스프린트 / 해커톤'))
    const refineInput = screen.getByPlaceholderText('수정 요청 (예: 베타를 2주로 늘려줘)')
    expect(refineInput).toBeInTheDocument()
    const refineBtn = screen.getByRole('button', { name: /수정/ })
    expect(refineBtn).toBeDisabled()
    fireEvent.change(refineInput, { target: { value: '리서치 단계 빼줘' } })
    expect(refineBtn).not.toBeDisabled()
  })
})
