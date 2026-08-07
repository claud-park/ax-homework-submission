import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { apiFetch } from '@/lib/api-client'
import MilestoneActivityLogToggle from '@/components/milestones/MilestoneActivityLogToggle'

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>

describe('MilestoneActivityLogToggle', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('does not fetch logs until expanded', () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('fetches and renders log entries on first expand', async () => {
    mockApiFetch.mockResolvedValue({
      logs: [
        { id: 'l1', milestone_id: 'm1', user_id: 'u1', log_date: '2026-08-07', note: 'ModuSign 연동 에러 핸들링 보완', created_at: '2026-08-07T10:00:00Z' },
      ],
    })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(screen.getByText('ModuSign 연동 에러 핸들링 보완')).toBeInTheDocument())
    expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1/log')
  })

  it('passes user_id as a query param when provided (admin viewing a champion)', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" userId="champion-42" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1/log?user_id=champion-42'))
  })

  it('does not re-fetch on subsequent expands after the first successful load', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    const button = screen.getByText(/작업 로그/)
    fireEvent.click(button)
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1))
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
  })

  it('shows an empty-state message when there are no log entries', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(screen.getByText('기록된 작업 로그가 없습니다.')).toBeInTheDocument())
  })

  it('shows a retryable error state and does not get stuck on a failed fetch', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network error'))
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    const button = screen.getByText(/작업 로그/)
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByText(/불러오지 못했습니다/)).toBeInTheDocument())

    // Collapse and expand again — this time the fetch succeeds, proving the component can retry
    mockApiFetch.mockResolvedValueOnce({
      logs: [{ id: 'l1', milestone_id: 'm1', user_id: 'u1', log_date: '2026-08-07', note: '재시도 성공', created_at: '2026-08-07T10:00:00Z' }],
    })
    fireEvent.click(button) // collapse
    fireEvent.click(button) // expand again — should re-attempt the fetch
    await waitFor(() => expect(screen.getByText('재시도 성공')).toBeInTheDocument())
    expect(mockApiFetch).toHaveBeenCalledTimes(2)
  })

  it('labels a log dated today as "오늘" and one from 3 days ago as "3일 전", independent of timezone', async () => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const threeDaysAgo = new Date(today.getTime() - 3 * 86400000)
    const threeDaysAgoStr = `${threeDaysAgo.getFullYear()}-${String(threeDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(threeDaysAgo.getDate()).padStart(2, '0')}`
    mockApiFetch.mockResolvedValue({
      logs: [
        { id: 'l1', milestone_id: 'm1', user_id: 'u1', log_date: todayStr, note: '오늘 작업', created_at: `${todayStr}T10:00:00Z` },
        { id: 'l2', milestone_id: 'm1', user_id: 'u1', log_date: threeDaysAgoStr, note: '사흘 전 작업', created_at: `${threeDaysAgoStr}T10:00:00Z` },
      ],
    })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(screen.getByText('오늘 작업')).toBeInTheDocument())
    expect(screen.getByText(`${todayStr} · 오늘`)).toBeInTheDocument()
    expect(screen.getByText(`${threeDaysAgoStr} · 3일 전`)).toBeInTheDocument()
  })

  it('does not double-fetch on rapid expand/collapse/expand before the first fetch resolves', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    mockApiFetch.mockImplementationOnce(() => new Promise(resolve => { resolveFetch = resolve }))
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    const button = screen.getByText(/작업 로그/)
    fireEvent.click(button) // expand — starts a pending fetch
    fireEvent.click(button) // collapse while still loading
    fireEvent.click(button) // expand again while still loading — must NOT start a second fetch
    resolveFetch({ logs: [] })
    await waitFor(() => expect(screen.getByText('기록된 작업 로그가 없습니다.')).toBeInTheDocument())
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
  })
})
