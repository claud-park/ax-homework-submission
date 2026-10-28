import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn(() => Promise.resolve({})) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(() => 'tid'), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }))

import { describe, it, expect, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { MilestonesClient } from '@/app/(champion)/my-project/milestones/MilestonesClient'
import type { Milestone } from '@/lib/types'

const mockApiFetch = apiFetch as unknown as Mock

const base: Milestone = {
  id: 'm1', user_id: 'u1', season_id: 's1', charter_submission_id: 'c', week_number: null,
  title: '로그인 개편', description: null, start_date: '2026-01-01', due_date: '2099-12-31',
  status: 'in_progress', is_manual_progress: true, is_manual_completed: false,
  bottleneck_type: null, bottleneck_note: null, bottleneck_admin_comment: null,
  bottleneck_reviewed_at: null, note: null, parent_milestone_id: null, display_order: 0,
  source: 'manual', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  publish_status: 'published',
} as Milestone

const charter = { id: 'c', title: '과제', project_name: '과제', admin_approved_at: '2026-01-01T00:00:00Z' } as any

function renderClient(ms: Milestone[]) {
  render(<MilestonesClient initialMilestones={ms} charterApproved charters={[charter]} currentCharterId="c" todayStr="2026-06-01" />)
  return screen.getByTestId('milestones-desktop')
}

function renderMobile(ms: Milestone[]) {
  render(<MilestonesClient initialMilestones={ms} charterApproved charters={[charter]} currentCharterId="c" todayStr="2026-06-01" />)
  return screen.getByTestId('milestones-mobile')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApiFetch.mockImplementation(() => Promise.resolve({}))
})

/** PATCH body를 현재 마일스톤에 병합해 돌려주는 서버 흉내. */
function reflectPatches(initial: Milestone) {
  let current = initial
  mockApiFetch.mockImplementation((_url: string, init?: { method?: string, body?: string }) => {
    if (init?.method !== 'PATCH') return Promise.resolve({ logs: [] })
    current = { ...current, ...JSON.parse(init.body ?? '{}') }
    return Promise.resolve({ milestone: current, parentUpdated: null })
  })
}

const patchCalls = () => mockApiFetch.mock.calls.filter(c => c[1]?.method === 'PATCH')

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
        todayStr="2026-06-01"
      />
    )

    expect(screen.getByRole('option', { name: '상세페이지 메이커' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '' })).not.toBeInTheDocument()
  })
})

describe('MilestonesClient status view', () => {
  it('completing from in_progress has no confirm dialog and offers undo that restores in_progress', async () => {
    const m = base
    mockApiFetch.mockResolvedValue({ milestone: { ...m, status: 'completed', is_manual_completed: true }, parentUpdated: null })
    const desktop = renderClient([m])

    fireEvent.click(within(desktop).getByRole('button', { name: '완료로' }))

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1', expect.objectContaining({ method: 'PATCH' })))
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ is_manual_completed: true, bottleneck_type: null, bottleneck_note: null })
    expect(screen.queryByText('마일스톤을 완료로 표시하시겠어요?')).not.toBeInTheDocument()
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    const [msg, opts] = (toast.success as Mock).mock.calls[0]
    expect(msg).toBe('완료로 표시했습니다.')
    expect(opts.duration).toBe(6000)
    expect(opts.action.label).toBe('되돌리기')
    await waitFor(() => expect(within(desktop).getByRole('button', { name: '완료' })).toBeInTheDocument())

    mockApiFetch.mockResolvedValue({ milestone: m, parentUpdated: null })
    opts.action.onClick()

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2))
    expect(mockApiFetch.mock.calls[1][0]).toBe('/api/milestones/m1')
    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toEqual({ is_manual_completed: false, is_manual_progress: true })
    await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith('되돌렸습니다.'))
    expect(within(desktop).getByRole('button', { name: '완료로' })).toBeInTheDocument()
  })

  it('starting then undoing PATCHes is_manual_progress: false', async () => {
    const m = { ...base, status: 'not_started', is_manual_progress: false } as Milestone
    mockApiFetch.mockResolvedValue({ milestone: { ...m, status: 'in_progress', is_manual_progress: true }, parentUpdated: null })
    const desktop = renderClient([m])

    fireEvent.click(within(desktop).getByRole('button', { name: '시작' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    const [msg, opts] = (toast.success as Mock).mock.calls[0]
    expect(msg).toBe('진행중으로 표시했습니다.')
    mockApiFetch.mockResolvedValue({ milestone: m, parentUpdated: null })
    opts.action.onClick()
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2))
    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toEqual({ is_manual_progress: false })
    await waitFor(() => expect(within(desktop).getByRole('button', { name: '시작' })).toBeInTheDocument())
  })

  it('charter_not_approved error shows the approval toast', async () => {
    mockApiFetch.mockRejectedValue(new Error('charter_not_approved'))
    const desktop = renderClient([base])

    fireEvent.click(within(desktop).getByRole('button', { name: '완료로' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('과제정의서 승인 후 진행할 수 있습니다.'))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('uses the server-provided todayStr for D-badges (no client Date)', () => {
    const area = renderClient([{ ...base, due_date: '2026-06-03', status: 'in_progress' } as Milestone])
    expect(within(area).getByText('D-2')).toBeInTheDocument()
  })

  it('filter chip 지연 hides non-delayed rows', () => {
    const late = { ...base, id: 'late', title: '지연된 작업', status: 'delayed', is_manual_progress: true, due_date: '2026-01-10' } as Milestone
    const ok = { ...base, id: 'ok', title: '순항 작업' } as Milestone
    const desktop = renderClient([late, ok])

    expect(within(desktop).getByText('지연된 작업')).toBeInTheDocument()
    expect(within(desktop).getByText('순항 작업')).toBeInTheDocument()

    fireEvent.click(within(desktop).getByRole('button', { name: '지연 1' }))

    expect(within(desktop).getByText('지연된 작업')).toBeInTheDocument()
    expect(within(desktop).queryByText('순항 작업')).not.toBeInTheDocument()
  })

  it('parent with children renders a group header without a stepper; childless top-level renders as a plain row with one', () => {
    const parent = { ...base, id: 'p', title: '상위 단계', status: 'not_started', is_manual_progress: false } as Milestone
    const child = { ...base, id: 'c1', title: '하위 작업', parent_milestone_id: 'p' } as Milestone
    const loose = { ...base, id: 'l', title: '단독 작업' } as Milestone
    const desktop = renderClient([parent, child, loose])

    const header = within(desktop).getByRole('button', { name: /상위 단계/ })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(within(desktop).getByText('0/1 완료')).toBeInTheDocument()
    // 하위가 있는 상위에는 스테퍼를 두지 않는다: child row stepper + loose row stepper
    expect(within(desktop).getAllByRole('group', { name: '진행 단계' })).toHaveLength(2)
    // childless top-level: no group header
    expect(within(desktop).queryByRole('button', { name: /단독 작업/ })).not.toBeInTheDocument()
    expect(within(desktop).getByText('단독 작업')).toBeInTheDocument()

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(within(desktop).queryByText('하위 작업')).not.toBeInTheDocument()
    expect(within(desktop).getAllByRole('group', { name: '진행 단계' })).toHaveLength(1)
  })

  it('in-progress parent with delayed children: only child rows carry a stepper and their 시작 is enabled', () => {
    const parent = { ...base, id: 'p', title: '상위 단계', status: 'in_progress', is_manual_progress: true, start_date: '2026-05-01', due_date: '2026-05-20' } as Milestone
    const c1 = { ...base, id: 'c1', title: '하위 지연 작업', parent_milestone_id: 'p', status: 'delayed', is_manual_progress: false, start_date: '2026-05-01', due_date: '2026-05-10' } as Milestone
    const c2 = { ...base, id: 'c2', title: '하위 시작 지연', parent_milestone_id: 'p', status: 'not_started', is_manual_progress: false, start_date: '2026-05-15', due_date: '2026-06-10' } as Milestone
    const desktop = renderClient([parent, c1, c2])

    const groups = within(desktop).getAllByRole('group', { name: '진행 단계' })
    expect(groups).toHaveLength(2)
    for (const g of groups) {
      const start = within(g).getByRole('button', { name: '시작' })
      expect(start).toBeEnabled()
      expect(start).not.toHaveAttribute('aria-disabled')
    }
    // 상위 헤더에는 ✓ 시작(비활성) 세그먼트가 없다
    expect(within(desktop).queryAllByRole('button', { name: '완료로' })).toHaveLength(0)
  })

  it('mobile: parent with children shows no parent stepper', () => {
    const parent = { ...base, id: 'p', title: '상위 단계', status: 'not_started', is_manual_progress: false } as Milestone
    const child = { ...base, id: 'c1', title: '하위 작업', parent_milestone_id: 'p' } as Milestone
    const mobile = renderMobile([parent, child])
    expect(within(mobile).getByText('상위 단계')).toBeInTheDocument()
    expect(within(mobile).getAllByRole('group', { name: '진행 단계' })).toHaveLength(1)
  })

  it('summary and chips count only group items, not the parent header', () => {
    // parent: start passed, not started → would be 지연 if counted
    const parent = { ...base, id: 'p', title: '상위 단계', status: 'not_started', is_manual_progress: false, start_date: '2026-01-01' } as Milestone
    const child = { ...base, id: 'c1', title: '하위 작업', parent_milestone_id: 'p', status: 'delayed', is_manual_progress: true, due_date: '2026-01-10' } as Milestone
    const desktop = renderClient([parent, child])

    expect(within(desktop).getByRole('button', { name: '전체 1' })).toBeInTheDocument()
    expect(within(desktop).getByRole('button', { name: '지연 1' })).toBeInTheDocument()
    expect(within(desktop).getByText('/ 1 완료')).toBeInTheDocument()
    expect(within(desktop).getByText('1건')).toBeInTheDocument() // 지연 n건 in the right panel
  })

  it('issue report PATCH keeps is_manual_progress untouched', async () => {
    const m = { ...base, status: 'delayed', is_manual_progress: true, due_date: '2026-01-10' } as Milestone
    mockApiFetch.mockResolvedValue({ milestone: { ...m, bottleneck_type: 'technical' }, parentUpdated: null })
    const desktop = renderClient([m])

    fireEvent.click(within(desktop).getByRole('button', { name: '이슈 보고' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'technical' } })
    fireEvent.change(within(dialog).getByPlaceholderText('이슈 상황을 자세히 설명해주세요'), { target: { value: 'API 지연' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '보고하기' }))

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1', expect.objectContaining({ method: 'PATCH' })))
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body)
    expect(body).toEqual({ bottleneck_type: 'technical', bottleneck_note: 'API 지연', is_manual_completed: false })
    expect(body).not.toHaveProperty('is_manual_progress')
  })

  it('starting a not_started item with a pending issue does not clear the report', async () => {
    const m = { ...base, status: 'delayed', is_manual_progress: false, bottleneck_type: 'technical', bottleneck_note: '막힘' } as Milestone
    mockApiFetch.mockResolvedValue({ milestone: { ...m, is_manual_progress: true }, parentUpdated: null })
    const desktop = renderClient([m])

    fireEvent.click(within(desktop).getByRole('button', { name: '시작' }))

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1))
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body)
    expect(body).toEqual({ is_manual_progress: true, is_manual_completed: false })
    expect(body).not.toHaveProperty('bottleneck_type')
  })

  it('note save failure keeps the editor open with the draft and shows an error toast', async () => {
    mockApiFetch.mockImplementation((_url: string, init?: { method?: string }) =>
      init?.method === 'PATCH' ? Promise.reject(new Error('boom')) : Promise.resolve({ logs: [] }))
    const desktop = renderClient([base])

    fireEvent.click(within(desktop).getByRole('button', { name: '상세 펼치기' }))
    fireEvent.click(within(desktop).getByRole('button', { name: '노트 편집' }))
    fireEvent.change(within(desktop).getByPlaceholderText('진행 상황을 간단히 메모해주세요'), { target: { value: '새 노트 초안' } })
    fireEvent.click(within(desktop).getByRole('button', { name: '저장' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('노트 저장에 실패했습니다: boom'))
    await waitFor(() => expect(within(desktop).getByRole('button', { name: '저장' })).not.toBeDisabled())
    expect(within(desktop).getByPlaceholderText('진행 상황을 간단히 메모해주세요')).toHaveValue('새 노트 초안')
  })

  it('a newer transition dismisses the previous undo toast and the stale undo is refused', async () => {
    const m = { ...base, status: 'not_started', is_manual_progress: false } as Milestone
    reflectPatches(m)
    ;(toast.success as Mock).mockReturnValueOnce('t1').mockReturnValueOnce('t2')
    const desktop = renderClient([m])

    fireEvent.click(within(desktop).getByRole('button', { name: '시작' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    const startOpts = (toast.success as Mock).mock.calls[0][1]
    expect(toast.dismiss).not.toHaveBeenCalled()

    fireEvent.click(await within(desktop).findByRole('button', { name: '완료로' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2))
    expect((toast.success as Mock).mock.calls[1][0]).toBe('완료로 표시했습니다.')
    expect(toast.dismiss).toHaveBeenCalledWith('t1')
    expect(patchCalls()).toHaveLength(2)

    startOpts.action.onClick()
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('이미 다른 변경이 있어 되돌릴 수 없습니다.'))
    expect(patchCalls()).toHaveLength(2)
    expect(toast.success).toHaveBeenCalledTimes(2)
  })

  it('unmount dismisses the pending undo toast', async () => {
    const m = { ...base, status: 'not_started', is_manual_progress: false } as Milestone
    reflectPatches(m)
    ;(toast.success as Mock).mockReturnValueOnce('t1')
    const { unmount } = render(<MilestonesClient initialMilestones={[m]} charterApproved charters={[charter]} currentCharterId="c" todayStr="2026-06-01" />)
    fireEvent.click(within(screen.getByTestId('milestones-desktop')).getByRole('button', { name: '시작' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(toast.dismiss).not.toHaveBeenCalled()
    unmount()
    expect(toast.dismiss).toHaveBeenCalledWith('t1')
  })

  it('undo while the same milestone is busy shows an info toast and sends nothing', async () => {
    const m = { ...base, status: 'not_started', is_manual_progress: false } as Milestone
    reflectPatches(m)
    const desktop = renderClient([m])

    fireEvent.click(within(desktop).getByRole('button', { name: '시작' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    const opts = (toast.success as Mock).mock.calls[0][1]

    // 첫 되돌리기 PATCH를 매달아 둔 채 두 번째 되돌리기를 누른다.
    let release!: (v: unknown) => void
    mockApiFetch.mockImplementation(() => new Promise(r => { release = r }))
    opts.action.onClick()
    await waitFor(() => expect(patchCalls()).toHaveLength(2))

    opts.action.onClick()
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('처리 중입니다. 잠시 후 다시 시도해주세요.'))
    expect(patchCalls()).toHaveLength(2)

    release({ milestone: m, parentUpdated: null })
    await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith('되돌렸습니다.'))
  })

  it('double-clicking 시작 sends a single PATCH', async () => {
    const m = { ...base, status: 'not_started', is_manual_progress: false } as Milestone
    reflectPatches(m)
    const desktop = renderClient([m])

    const btn = within(desktop).getByRole('button', { name: '시작' })
    fireEvent.click(btn)
    fireEvent.click(btn)

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(patchCalls()).toHaveLength(1)
  })
})
