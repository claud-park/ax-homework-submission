import { describe, it, expect } from 'vitest'
import { isMissingColumnError, parseRecapChannelId, isRecapChannelId } from '@/lib/recap/channelId'

describe('parseRecapChannelId', () => {
  it('accepts C/G ids after trimming', () => {
    expect(parseRecapChannelId('  C0123ABCD ')).toEqual({ ok: true, channelId: 'C0123ABCD' })
    expect(parseRecapChannelId('G01234567X')).toEqual({ ok: true, channelId: 'G01234567X' })
  })
  it('treats null / empty / whitespace as clear', () => {
    expect(parseRecapChannelId(null)).toEqual({ ok: true, channelId: null })
    expect(parseRecapChannelId('')).toEqual({ ok: true, channelId: null })
    expect(parseRecapChannelId('   ')).toEqual({ ok: true, channelId: null })
  })
  it('rejects bad formats without forcing uppercase', () => {
    for (const bad of ['c0123abcd', 'D0123ABCD', 'C0123', '#general', 'C0123ABCD>', 'U0123ABCD', 'C0123 ABCD']) {
      expect(parseRecapChannelId(bad).ok).toBe(false)
    }
  })
  it('rejects non-string values', () => {
    expect(parseRecapChannelId(123).ok).toBe(false)
    expect(parseRecapChannelId(undefined).ok).toBe(false)
    expect(parseRecapChannelId({}).ok).toBe(false)
  })
})

describe('isRecapChannelId', () => {
  it('matches only the stored format', () => {
    expect(isRecapChannelId('C0123ABCD')).toBe(true)
    expect(isRecapChannelId('C0123ABCD> <!channel')).toBe(false)
    expect(isRecapChannelId(null)).toBe(false)
  })
})

describe('isMissingColumnError', () => {
  it('detects undefined column / schema cache errors', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column users.recap_slack_channel_id does not exist' })).toBe(true)
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'recap_slack_channel_id' column" })).toBe(true)
    expect(isMissingColumnError({ code: '500', message: 'db down' })).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
  })
})
