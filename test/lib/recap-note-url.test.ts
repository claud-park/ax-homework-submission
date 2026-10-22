import { describe, it, expect, afterEach } from 'vitest'
import { buildNoteUrl, resolveBaseUrl, trimEnv } from '@/lib/recap/noteUrl'

describe('buildNoteUrl', () => {
  it('points at the champion-accessible session page, never /admin/', () => {
    const url = buildNoteUrl({ baseUrl: 'https://app.test/', sessionId: 's1' })
    expect(url).toBe('https://app.test/my-project/sessions/s1')
    expect(url).toContain('/my-project/sessions/s1')
    expect(url).not.toContain('/admin/')
  })
})

describe('trimEnv / resolveBaseUrl', () => {
  const orig = process.env.APP_BASE_URL
  afterEach(() => {
    if (orig === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = orig
  })
  it('treats whitespace-only values as unset and trims padding', () => {
    expect(trimEnv('  \n')).toBeUndefined()
    expect(trimEnv(undefined)).toBeUndefined()
    expect(trimEnv(' A0123\n')).toBe('A0123')
  })
  it('trims APP_BASE_URL and falls back to localhost', () => {
    process.env.APP_BASE_URL = ' https://prod.test\n'
    expect(resolveBaseUrl()).toBe('https://prod.test')
    process.env.APP_BASE_URL = '  '
    expect(resolveBaseUrl()).toBe('http://localhost:3000')
  })
})
