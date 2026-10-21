import { createHmac, timingSafeEqual } from 'crypto'

const MAX_SKEW_SECONDS = 300

export function verifySlackSignature(args: {
  body: string
  timestamp: string | null
  signature: string | null
  secret: string
  now?: number
}): boolean {
  const { body, timestamp, signature, secret, now = Date.now() } = args
  if (!secret || !timestamp || !signature) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(now / 1000 - ts) > MAX_SKEW_SECONDS) return false

  const hash = createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')
  const sigBuf = Buffer.from(signature)
  const hashBuf = Buffer.from(`v0=${hash}`)
  if (sigBuf.length !== hashBuf.length) return false
  return timingSafeEqual(sigBuf, hashBuf)
}
