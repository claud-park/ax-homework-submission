import { describe, it, expect } from 'vitest'
import { isAdminUser } from '@/lib/auth'

describe('isAdminUser', () => {
  it('returns true when app_metadata.is_admin is true', () => {
    expect(isAdminUser({ app_metadata: { is_admin: true } })).toBe(true)
  })

  it('returns false when only user_metadata.is_admin is true (privilege escalation closed)', () => {
    // user_metadata is client-writable, so it must NOT grant admin.
    expect(isAdminUser({ user_metadata: { is_admin: true }, app_metadata: {} })).toBe(false)
  })

  it('returns false when app_metadata.is_admin is absent', () => {
    expect(isAdminUser({ app_metadata: {} })).toBe(false)
    expect(isAdminUser({})).toBe(false)
  })

  it('returns false for null/undefined user', () => {
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser(undefined)).toBe(false)
  })
})
