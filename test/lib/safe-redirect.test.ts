import { describe, it, expect } from 'vitest'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

describe('sanitizeRedirectPath', () => {
  it('returns "/" for null', () => {
    expect(sanitizeRedirectPath(null)).toBe('/')
  })

  it('returns "/" for undefined', () => {
    expect(sanitizeRedirectPath(undefined)).toBe('/')
  })

  it('returns "/" for an empty string', () => {
    expect(sanitizeRedirectPath('')).toBe('/')
  })

  it('passes through a same-origin path with a query string', () => {
    expect(sanitizeRedirectPath('/pairing?code=7X4K9P')).toBe('/pairing?code=7X4K9P')
  })

  it('rejects protocol-relative URLs (open-redirect via //)', () => {
    expect(sanitizeRedirectPath('//evil.com')).toBe('/')
  })

  it('rejects absolute URLs to other hosts', () => {
    expect(sanitizeRedirectPath('https://evil.com')).toBe('/')
  })

  it('rejects paths not starting with /', () => {
    expect(sanitizeRedirectPath('javascript:alert(1)')).toBe('/')
  })
})
