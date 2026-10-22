import { describe, it, expect } from 'vitest'
import { recapSlack } from '@/lib/recap/slackClient'

describe('recapSlack', () => {
  it('disables retries and sets a short timeout', () => {
    const c = recapSlack as unknown as {
      retryConfig: { retries: number }
      axios: { defaults: { timeout: number } }
    }
    expect(c.retryConfig.retries).toBe(0)
    expect(c.axios.defaults.timeout).toBe(8000)
  })
})
