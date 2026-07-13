import { describe, it, expect, vi } from 'vitest'
import type { OAuth2Client } from 'googleapis-common'

const mockQuery = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      freebusy: { query: mockQuery },
    })),
  },
}))

import { findFreeRoom, MEETING_ROOM_EMAILS } from '@/lib/one-on-one/meeting-rooms'

describe('findFreeRoom', () => {
  const auth = {} as OAuth2Client

  it('모든 회의실이 비어 있으면 목록 첫 번째 이메일을 반환한다', async () => {
    mockQuery.mockResolvedValue({
      data: {
        calendars: Object.fromEntries(
          MEETING_ROOM_EMAILS.map((email) => [email, { busy: [] }])
        ),
      },
    })

    const result = await findFreeRoom(auth, '2026-07-13T10:00:00+09:00', '2026-07-13T10:30:00+09:00')

    expect(result).toBe(MEETING_ROOM_EMAILS[0])
  })

  it('첫 회의실이 busy면 두 번째 빈 회의실을 반환한다', async () => {
    mockQuery.mockResolvedValue({
      data: {
        calendars: {
          [MEETING_ROOM_EMAILS[0]]: { busy: [{ start: '2026-07-13T10:00:00+09:00', end: '2026-07-13T10:30:00+09:00' }] },
          [MEETING_ROOM_EMAILS[1]]: { busy: [] },
        },
      },
    })

    const result = await findFreeRoom(auth, '2026-07-13T10:00:00+09:00', '2026-07-13T10:30:00+09:00')

    expect(result).toBe(MEETING_ROOM_EMAILS[1])
  })

  it('errors가 있는 회의실은 건너뛴다', async () => {
    mockQuery.mockResolvedValue({
      data: {
        calendars: {
          [MEETING_ROOM_EMAILS[0]]: { errors: [{ domain: 'global', reason: 'notFound' }] },
          [MEETING_ROOM_EMAILS[1]]: { busy: [] },
        },
      },
    })

    const result = await findFreeRoom(auth, '2026-07-13T10:00:00+09:00', '2026-07-13T10:30:00+09:00')

    expect(result).toBe(MEETING_ROOM_EMAILS[1])
  })

  it('전부 busy거나 query가 throw하면 null을 반환한다', async () => {
    mockQuery.mockResolvedValue({
      data: {
        calendars: Object.fromEntries(
          MEETING_ROOM_EMAILS.map((email) => [
            email,
            { busy: [{ start: '2026-07-13T10:00:00+09:00', end: '2026-07-13T10:30:00+09:00' }] },
          ])
        ),
      },
    })

    const allBusyResult = await findFreeRoom(auth, '2026-07-13T10:00:00+09:00', '2026-07-13T10:30:00+09:00')
    expect(allBusyResult).toBeNull()

    mockQuery.mockRejectedValue(new Error('network error'))

    const throwResult = await findFreeRoom(auth, '2026-07-13T10:00:00+09:00', '2026-07-13T10:30:00+09:00')
    expect(throwResult).toBeNull()
  })
})
