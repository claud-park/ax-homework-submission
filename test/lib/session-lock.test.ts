import { describe, it, expect, vi } from 'vitest'
import { claimSessionForProcessing } from '@/lib/sessions/lock'

function fakeSupabase(result: { data: boolean | null; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc }, spies: { rpc } }
}

describe('claimSessionForProcessing', () => {
  it('RPC가 true를 반환하면 true (클레임 성공)', async () => {
    const { client } = fakeSupabase({ data: true, error: null })
    expect(await claimSessionForProcessing(client as never, 's1')).toBe(true)
  })

  it('RPC가 false를 반환하면 false (이미 처리 중, 비-stale)', async () => {
    const { client } = fakeSupabase({ data: false, error: null })
    expect(await claimSessionForProcessing(client as never, 's1')).toBe(false)
  })

  it('stale 복구 파라미터와 함께 claim RPC를 호출한다', async () => {
    const { client, spies } = fakeSupabase({ data: true, error: null })
    await claimSessionForProcessing(client as never, 's1')
    expect(spies.rpc).toHaveBeenCalledWith('claim_session_for_processing', {
      p_session_id: 's1',
      p_stale_seconds: 360,
    })
  })

  it('DB 에러가 나면 throw 한다 (409로 위장하지 않음)', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } })
    await expect(claimSessionForProcessing(client as never, 's1')).rejects.toBeTruthy()
  })
})
