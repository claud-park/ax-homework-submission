import { describe, it, expect, vi } from 'vitest'
import {
  createCachedSlackEmailLookup,
  createSchedulerSourceFromEnv,
  loadSchedulerBookings,
  normalizeEmail,
  normalizeSchedulerRow,
  resolveSlackEmails,
  type SchedulerBookingRow,
  type SchedulerSource,
} from '@/lib/one-on-one/scheduler-bookings'

function srow(over: Partial<SchedulerBookingRow> = {}): SchedulerBookingRow {
  return {
    id: 'aaaa',
    user_slack_id: 'U1',
    user_name: '김하나',
    selected_slots: [
      { start: '2026-10-28T05:00:00Z', end: '2026-10-28T05:30:00Z', available_admins: ['claud'] },
      { start: '2026-10-27T05:00:00Z', end: '2026-10-27T05:30:00Z', available_admins: ['jennifer'] },
    ],
    status: 'pending',
    confirmed_by: null,
    confirmed_slot: null,
    created_at: '2026-10-20T00:00:00Z',
    ...over,
  }
}

describe('normalizeSchedulerRow', () => {
  it('pending → 가장 이른 희망 슬롯, slack: id, updated_at = created_at', () => {
    expect(normalizeSchedulerRow(srow())).toEqual({
      id: 'slack:aaaa',
      source: 'slack',
      userSlackId: 'U1',
      userName: '김하나',
      slot_start: '2026-10-27T05:00:00Z',
      slot_end: '2026-10-27T05:30:00Z',
      status: 'pending',
      confirmed_by: null,
      created_at: '2026-10-20T00:00:00Z',
      updated_at: '2026-10-20T00:00:00Z',
    })
  })

  it('confirmed → confirmed_slot 사용, confirmed_by 전달', () => {
    const b = normalizeSchedulerRow(
      srow({
        status: 'confirmed',
        confirmed_by: 'jennifer',
        confirmed_slot: { start: '2026-10-28T05:00:00Z', end: '2026-10-28T06:00:00Z', available_admins: ['jennifer'] },
      }),
    )
    expect(b).toMatchObject({
      status: 'confirmed',
      confirmed_by: 'jennifer',
      slot_start: '2026-10-28T05:00:00Z',
      slot_end: '2026-10-28T06:00:00Z',
    })
  })

  it('confirmed인데 confirmed_slot이 없으면 건너뛴다', () => {
    expect(normalizeSchedulerRow(srow({ status: 'confirmed', confirmed_slot: null }))).toBeNull()
  })

  it('cancelled → confirmed_slot 우선, 없으면 가장 이른 희망 슬롯', () => {
    expect(normalizeSchedulerRow(srow({ status: 'cancelled' }))).toMatchObject({
      status: 'cancelled',
      slot_start: '2026-10-27T05:00:00Z',
    })
    expect(
      normalizeSchedulerRow(
        srow({ status: 'cancelled', confirmed_slot: { start: '2026-10-29T01:00:00Z', end: '2026-10-29T01:30:00Z' } }),
      ),
    ).toMatchObject({ status: 'cancelled', slot_start: '2026-10-29T01:00:00Z' })
  })

  it('expired는 무시한다', () => {
    expect(normalizeSchedulerRow(srow({ status: 'expired' }))).toBeNull()
  })

  it('희망 슬롯이 없는 pending은 건너뛴다', () => {
    expect(normalizeSchedulerRow(srow({ selected_slots: [] }))).toBeNull()
    expect(normalizeSchedulerRow(srow({ selected_slots: null }))).toBeNull()
  })
})

describe('normalizeEmail', () => {
  it('trim + 소문자', () => {
    expect(normalizeEmail('  Kim.Hana@Dreamus.IO ')).toBe('kim.hana@dreamus.io')
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
  })
})

describe('resolveSlackEmails', () => {
  it('중복 id는 한 번만 조회하고 동시 실행 수를 제한한다', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const lookup = vi.fn(async (id: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight -= 1
      return `${id}@x.io`
    })
    const ids = Array.from({ length: 12 }, (_, i) => `U${i}`)
    const { emails, failed } = await resolveSlackEmails([...ids, 'U0', 'U1'], lookup, 5)
    expect(lookup).toHaveBeenCalledTimes(12)
    expect(maxInFlight).toBeLessThanOrEqual(5)
    expect(emails.get('U3')).toBe('u3@x.io')
    expect(failed).toBe(0)
  })

  it('한 id 조회가 실패해도 나머지는 계속한다', async () => {
    const lookup = async (id: string) => {
      if (id === 'BAD') throw new Error('user_not_found')
      return `${id}@x.io`
    }
    const { emails, failed } = await resolveSlackEmails(['U1', 'BAD'], lookup)
    expect(emails.get('U1')).toBe('u1@x.io')
    expect(emails.get('BAD')).toBeNull()
    expect(failed).toBe(1)
  })
})

describe('createCachedSlackEmailLookup', () => {
  it('TTL 동안 결과를 캐시하고, 만료되면 다시 조회한다. 실패는 캐시하지 않는다', async () => {
    let t = 0
    const cache = new Map()
    const raw = vi.fn(async (id: string) => {
      if (id === 'BAD') throw new Error('rate_limited')
      return `${id}@x.io`
    })
    const lookup = createCachedSlackEmailLookup(raw, { ttlMs: 1000, cache, now: () => t })
    await lookup('U1')
    await lookup('U1')
    expect(raw).toHaveBeenCalledTimes(1)
    t = 1001
    await lookup('U1')
    expect(raw).toHaveBeenCalledTimes(2)
    await expect(lookup('BAD')).rejects.toThrow()
    await expect(lookup('BAD')).rejects.toThrow()
    expect(raw).toHaveBeenCalledTimes(4)
  })
})

describe('createSchedulerSourceFromEnv', () => {
  it('SCHEDULER_* env가 없으면 null', () => {
    expect(createSchedulerSourceFromEnv({})).toBeNull()
    expect(createSchedulerSourceFromEnv({ SCHEDULER_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull()
  })

  it('둘 다 있으면 source를 만든다', () => {
    const s = createSchedulerSourceFromEnv({
      SCHEDULER_SUPABASE_URL: 'https://x.supabase.co',
      SCHEDULER_SUPABASE_SERVICE_KEY: 'k',
    })
    expect(typeof s?.fetchBookings).toBe('function')
  })
})

describe('loadSchedulerBookings', () => {
  it('정규화된 예약에 소문자 이메일을 붙이고 expired는 뺀다', async () => {
    const source: SchedulerSource = {
      fetchBookings: async () => [srow(), srow({ id: 'bbbb', user_slack_id: 'U2', status: 'expired' })],
    }
    const result = await loadSchedulerBookings(source, async () => ' Kim@X.io ')
    expect(result.allLookupsFailed).toBe(false)
    expect(result.bookings).toHaveLength(1)
    expect(result.bookings[0]).toMatchObject({ id: 'slack:aaaa', email: 'kim@x.io' })
  })

  it('조회가 전부 실패하면 allLookupsFailed', async () => {
    const source: SchedulerSource = { fetchBookings: async () => [srow()] }
    const result = await loadSchedulerBookings(source, async () => {
      throw new Error('invalid_auth')
    })
    expect(result.allLookupsFailed).toBe(true)
    expect(result.bookings[0].email).toBeNull()
  })
})
