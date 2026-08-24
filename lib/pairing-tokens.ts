import { randomBytes, createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// 0/O, 1/I/L 등 헷갈리는 문자를 뺀 33자 알파벳 — 챔피언이 화면에서 손으로 옮겨 적어도 오타가 잘 안 남
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function generatePairingCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join('')
}

export function generatePersonalAccessToken(): string {
  return `amst_${randomBytes(32).toString('base64url')}`
}

export function generateAdminAccessToken(): string {
  return `admt_${randomBytes(32).toString('base64url')}`
}

/**
 * 페어링 코드의 scope와 승인자의 관리자 여부만으로 승인 가능 여부를 판정하는
 * 순수 함수. app/api/pairing/approve/route.ts가 이 함수를 써서, "관리자 스코프
 * 코드는 실제 관리자만 승인 가능"이라는 불변식이 DB 없이도 단위 테스트로
 * 고정되게 한다.
 */
export function canApprovePairing(pairingScope: 'champion' | 'admin', callerIsAdmin: boolean): boolean {
  return pairingScope !== 'admin' || callerIsAdmin
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * 승인된 페어링 코드의 issued_token을 원자적으로 클레임(읽고 즉시 clear)한다.
 * 원자성은 단일 UPDATE를 수행하는 RPC(claim_pairing_token)로 위임 —
 * update().select()로 재조회하면 방금 자신이 써넣은 NULL을 돌려받는 버그가 있다.
 * 코드가 없거나 이미 클레임된 경우 null.
 */
export async function claimPairingToken(
  supabase: Pick<SupabaseClient, 'rpc'>,
  code: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('claim_pairing_token', { p_code: code })
  if (error) throw error
  return data ?? null
}
