import { randomBytes, createHash } from 'crypto'

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

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
