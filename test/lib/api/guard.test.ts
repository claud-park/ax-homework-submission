import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentEnrollment } from '@/lib/api/guard'
import { verifyJWT } from '@/lib/auth'
import { getCurrentSeasonId, isEnrolledInCurrentSeason } from '@/lib/data/season'

vi.mock('@/lib/auth', () => ({ verifyJWT: vi.fn(), verifyAdmin: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn(() => ({})) }))
vi.mock('@/lib/data/season', () => ({ isEnrolledInCurrentSeason: vi.fn(), getCurrentSeasonId: vi.fn() }))

const mockedVerifyJWT = vi.mocked(verifyJWT)
const mockedIsEnrolled = vi.mocked(isEnrolledInCurrentSeason)

function fakeRequest() {
  return new NextRequest('http://localhost/api/test')
}

describe('requireCurrentEnrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when there is no authenticated user', async () => {
    mockedVerifyJWT.mockResolvedValue(null)
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it('returns 403 when the user has no active enrollment for the role', async () => {
    mockedVerifyJWT.mockResolvedValue({ id: 'u1', email: 'a@b.io' } as never)
    mockedIsEnrolled.mockResolvedValue(false)
    vi.mocked(getCurrentSeasonId).mockResolvedValue('season-2')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
    // 진단 로그: 누구의 어떤 시즌 판정이었는지 남는다(토큰 없음)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('user=u1'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('currentSeason=season-2'))
    warn.mockRestore()
  })

  it('returns the user when enrolled with the requested role', async () => {
    const user = { id: 'u1' } as never
    mockedVerifyJWT.mockResolvedValue(user)
    mockedIsEnrolled.mockResolvedValue(true)
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBe(user)
  })
})
