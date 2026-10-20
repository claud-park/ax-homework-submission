import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeasonInvite, SeasonRole } from '@/lib/types'

/**
 * 관리자가 붙여넣은 원문을 이메일 배열로 정규화한다.
 * 줄바꿈/쉼표/세미콜론/공백으로 분리, trim, 소문자화, 순서 유지 중복 제거.
 */
export function normalizeInviteEmails(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of raw.split(/[\s,;]+/)) {
    const email = token.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 형식이 맞고(allowedDomain이 있으면) 허용 도메인으로 끝나는 이메일만 valid로 분류한다.
 * 허용 도메인 밖 이메일은 로그인 자체가 막혀 영원히 소비되지 않으므로 등록 전에 걸러낸다.
 */
export function partitionInviteEmails(
  emails: string[],
  allowedDomain: string | undefined,
): { valid: string[]; invalid: string[] } {
  const suffix = allowedDomain ? `@${allowedDomain.toLowerCase()}` : null
  const valid: string[] = []
  const invalid: string[] = []
  for (const email of emails) {
    const ok = EMAIL_SHAPE.test(email) && (suffix === null || email.toLowerCase().endsWith(suffix))
    ;(ok ? valid : invalid).push(email)
  }
  return { valid, invalid }
}
