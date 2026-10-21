import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifySlackSignature } from '@/lib/one-on-one/slackSignature'

const secret = 'test-secret'
const body = 'payload=%7B%22a%22%3A1%7D'
const NOW_SEC = 1_800_000_000
const now = NOW_SEC * 1000

function sign(ts: string, b = body, s = secret) {
  return `v0=${createHmac('sha256', s).update(`v0:${ts}:${b}`).digest('hex')}`
}

describe('verifySlackSignature', () => {
  it('accepts a correctly signed fresh request', () => {
    const ts = String(NOW_SEC - 10)
    expect(verifySlackSignature({ body, timestamp: ts, signature: sign(ts), secret, now })).toBe(true)
  })

  it('rejects a wrong signature', () => {
    const ts = String(NOW_SEC)
    expect(verifySlackSignature({ body, timestamp: ts, signature: sign(ts, body, 'other'), secret, now })).toBe(false)
  })

  it('rejects when signature or timestamp header is missing', () => {
    const ts = String(NOW_SEC)
    expect(verifySlackSignature({ body, timestamp: ts, signature: null, secret, now })).toBe(false)
    expect(verifySlackSignature({ body, timestamp: null, signature: sign(ts), secret, now })).toBe(false)
  })

  it('rejects a timestamp older than 5 minutes', () => {
    const ts = String(NOW_SEC - 301)
    expect(verifySlackSignature({ body, timestamp: ts, signature: sign(ts), secret, now })).toBe(false)
  })

  it('rejects a timestamp more than 5 minutes in the future', () => {
    const ts = String(NOW_SEC + 301)
    expect(verifySlackSignature({ body, timestamp: ts, signature: sign(ts), secret, now })).toBe(false)
  })

  it('rejects a signature of different length without throwing', () => {
    const ts = String(NOW_SEC)
    expect(verifySlackSignature({ body, timestamp: ts, signature: 'v0=abc', secret, now })).toBe(false)
  })
})
