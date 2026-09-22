import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentEnrollment } from '@/lib/api/guard'
import { verifyJWT } from '@/lib/auth'
import { isEnrolledInCurrentSeason } from '@/lib/data/season'

vi.mock('@/lib/auth', () => ({ verifyJWT: vi.fn(), verifyAdmin: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn(() => ({})) }))
vi.mock('@/lib/data/season', () => ({ isEnrolledInCurrentSeason: vi.fn() }))

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
    mockedVerifyJWT.mockResolvedValue({ id: 'u1' } as never)
    mockedIsEnrolled.mockResolvedValue(false)
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  it('returns the user when enrolled with the requested role', async () => {
    const user = { id: 'u1' } as never
    mockedVerifyJWT.mockResolvedValue(user)
    mockedIsEnrolled.mockResolvedValue(true)
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBe(user)
  })
})
