import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(() => Promise.resolve({})) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MilestonesClient } from '@/app/(champion)/my-project/milestones/MilestonesClient'

describe('MilestonesClient charter dropdown', () => {
  it('falls back to project_name when title is an empty string, not just null/undefined', () => {
    const charters = [
      { id: 'a', title: '', project_name: '상세페이지 메이커', admin_approved_at: null },
      { id: 'b', title: '상품 모니터링 자동화', project_name: '상품 모니터링 자동화', admin_approved_at: null },
    ] as any

    render(
      <MilestonesClient
        initialMilestones={[]}
        charterApproved={false}
        charters={charters}
        currentCharterId="a"
      />
    )

    expect(screen.getByRole('option', { name: '상세페이지 메이커' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '' })).not.toBeInTheDocument()
  })
})
