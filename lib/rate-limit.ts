const buckets = new Map<string, number[]>()

/**
 * In-memory sliding-window rate limiter, keyed by any string (IP, code, etc).
 *
 * Best-effort only: Vercel Fluid Compute reuses warm instances, so this catches
 * abuse within a warm instance's lifetime, but does not coordinate across cold
 * starts or concurrent instances. That's an accepted tradeoff here — the pairing
 * code space (31^6) and the 10-minute TTL (see poll/route.ts) are the primary
 * defenses; this is a secondary throttle, not the sole protection, and doesn't
 * justify a dedicated distributed rate-limit service for this feature's scope.
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps)
    return true
  }
  timestamps.push(now)
  buckets.set(key, timestamps)
  return false
}
