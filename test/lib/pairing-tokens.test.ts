import { describe, it, expect } from 'vitest'
import { generatePairingCode, generatePersonalAccessToken, generateAdminAccessToken, hashToken, canApprovePairing } from '@/lib/pairing-tokens'

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

describe('generateAdminAccessToken', () => {
  it('starts with the admt_ prefix', () => {
    expect(generateAdminAccessToken()).toMatch(/^admt_/)
  })

  it('generates a token with at least 32 characters after the prefix', () => {
    const token = generateAdminAccessToken()
    expect(token.slice('admt_'.length).length).toBeGreaterThanOrEqual(32)
  })

  it('generates different tokens across calls', () => {
    expect(generateAdminAccessToken()).not.toBe(generateAdminAccessToken())
  })
})

describe('canApprovePairing', () => {
  it('allows a champion-scope code to be approved regardless of caller admin status', () => {
    expect(canApprovePairing('champion', false)).toBe(true)
    expect(canApprovePairing('champion', true)).toBe(true)
  })

  it('allows an admin-scope code to be approved only when the caller is an admin', () => {
    expect(canApprovePairing('admin', true)).toBe(true)
    expect(canApprovePairing('admin', false)).toBe(false)
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
