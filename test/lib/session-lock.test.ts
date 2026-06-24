import { describe, it, expect, vi } from 'vitest'
import { claimSessionForProcessing } from '@/lib/sessions/lock'

function fakeSupabase(returnedRows: { id: string }[]) {
  const select = vi.fn().mockResolvedValue({ data: returnedRows, error: null })
  const not = vi.fn(() => ({ select }))
  const eq = vi.fn(() => ({ not }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { client: { from }, spies: { from, update, eq, not, select } }
}

describe('claimSessionForProcessing', () => {
  it('영향 행이 있으면 true (클레임 성공)', async () => {
    const { client } = fakeSupabase([{ id: 's1' }])
    expect(await claimSessionForProcessing(client as never, 's1')).toBe(true)
  })
  it('영향 행이 없으면 false (이미 처리 중)', async () => {
    const { client } = fakeSupabase([])
    expect(await claimSessionForProcessing(client as never, 's1')).toBe(false)
  })
  it('in-flight 상태를 NOT IN으로 제외한다', async () => {
    const { client, spies } = fakeSupabase([{ id: 's1' }])
    await claimSessionForProcessing(client as never, 's1')
    expect(spies.not).toHaveBeenCalledWith('processing_status', 'in', '(uploading,transcribing,summarizing)')
  })
  it('DB 에러가 나면 throw 한다 (409로 위장하지 않음)', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const not = vi.fn(() => ({ select }))
    const eq = vi.fn(() => ({ not }))
    const update = vi.fn(() => ({ eq }))
    const client = { from: vi.fn(() => ({ update })) }
    await expect(claimSessionForProcessing(client as never, 's1')).rejects.toBeTruthy()
  })
})
