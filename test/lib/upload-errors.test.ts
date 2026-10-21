import { describe, it, expect } from 'vitest'
import { classifyFailure, AuthError } from '@/lib/sessions/uploadErrors'
import { HttpError } from '@/lib/sessions/retry'

describe('classifyFailure', () => {
  it('offline → network even for generic Error', () => {
    expect(classifyFailure(new Error('x'), false).kind).toBe('network')
  })

  it('TypeError while online → network', () => {
    expect(classifyFailure(new TypeError('Failed to fetch'), true).kind).toBe('network')
  })

  it('AuthError while online → auth', () => {
    expect(classifyFailure(new AuthError('expired'), true).kind).toBe('auth')
  })

  it('AuthError while offline → network', () => {
    expect(classifyFailure(new AuthError('expired'), false).kind).toBe('network')
  })

  it('generic Error online → server with its message', () => {
    expect(classifyFailure(new Error('처리 실패'), true)).toEqual({
      kind: 'server',
      message: '처리 실패',
    })
  })

  it('exhausted 5xx HttpError online → server', () => {
    expect(classifyFailure(new HttpError(503, '서버 오류'), true).kind).toBe('server')
  })
})
