import { describe, it, expect } from 'vitest'
import { normalizeInviteEmails, partitionInviteEmails } from '@/lib/data/season-invites'

describe('normalizeInviteEmails', () => {
  it('splits on newline/comma/semicolon/space, trims, lowercases, dedupes', () => {
    expect(normalizeInviteEmails(' A.B@Dreamus.io, c@dreamus.io\nC@DREAMUS.IO; d@dreamus.io  '))
      .toEqual(['a.b@dreamus.io', 'c@dreamus.io', 'd@dreamus.io'])
  })

  it('returns [] for blank input', () => {
    expect(normalizeInviteEmails('  \n ')).toEqual([])
  })
})

describe('partitionInviteEmails', () => {
  it('rejects malformed and off-domain emails when a domain is set', () => {
    expect(partitionInviteEmails(['a@dreamus.io', 'nope', 'b@gmail.com'], 'dreamus.io'))
      .toEqual({ valid: ['a@dreamus.io'], invalid: ['nope', 'b@gmail.com'] })
  })

  it('matches the allowed domain case-insensitively', () => {
    expect(partitionInviteEmails(['a@dreamus.io'], 'DREAMUS.IO')).toEqual({ valid: ['a@dreamus.io'], invalid: [] })
  })

  it('accepts any domain when allowedDomain is undefined', () => {
    expect(partitionInviteEmails(['b@gmail.com'], undefined)).toEqual({ valid: ['b@gmail.com'], invalid: [] })
  })
})
