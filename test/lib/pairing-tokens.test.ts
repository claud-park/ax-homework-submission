import { describe, it, expect, vi } from 'vitest'
import { generatePairingCode, generatePersonalAccessToken, hashToken, claimPairingToken } from '@/lib/pairing-tokens'

function fakeSupabase(result: { data: string | null; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc }, spies: { rpc } }
}

describe('generatePairingCode', () => {
  it('returns a 6-character uppercase code from the unambiguous alphabet', () => {
    const code = generatePairingCode()
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('does not contain ambiguous characters (0/O, 1/I/L)', () => {
    const code = generatePairingCode()
    expect(code).not.toMatch(/[01IOL]/)
  })

  it('generates different codes across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generatePairingCode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('generatePersonalAccessToken', () => {
  it('starts with the amst_ prefix', () => {
    expect(generatePersonalAccessToken()).toMatch(/^amst_/)
  })

  it('generates a token with at least 32 characters after the prefix', () => {
    const token = generatePersonalAccessToken()
    expect(token.slice('amst_'.length).length).toBeGreaterThanOrEqual(32)
  })

  it('generates different tokens across calls', () => {
    expect(generatePersonalAccessToken()).not.toBe(generatePersonalAccessToken())
  })
})

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashToken('amst_abc')).toBe(hashToken('amst_abc'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('amst_abc')).not.toBe(hashToken('amst_xyz'))
  })

  it('returns a 64-character hex string (sha256)', () => {
    expect(hashToken('amst_abc')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('claimPairingToken', () => {
  it('승인된 코드를 poll하면 RPC가 반환한 실제 토큰 문자열을 받는다', async () => {
    const { client } = fakeSupabase({ data: 'amst_realtoken123', error: null })
    expect(await claimPairingToken(client as never, 'ABCDEF')).toBe('amst_realtoken123')
  })

  it('같은 코드를 두 번째로 poll하면(이미 claim되어 RPC가 null 반환) null을 받는다', async () => {
    const { client } = fakeSupabase({ data: null, error: null })
    expect(await claimPairingToken(client as never, 'ABCDEF')).toBeNull()
  })

  it('claim RPC를 코드와 함께 호출한다', async () => {
    const { client, spies } = fakeSupabase({ data: 'amst_x', error: null })
    await claimPairingToken(client as never, 'ABCDEF')
    expect(spies.rpc).toHaveBeenCalledWith('claim_pairing_token', { p_code: 'ABCDEF' })
  })

  it('DB 에러가 나면 throw 한다 (expired로 위장하지 않음)', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } })
    await expect(claimPairingToken(client as never, 'ABCDEF')).rejects.toBeTruthy()
  })
})
