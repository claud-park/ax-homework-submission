import { describe, it, expect } from 'vitest'
import { unauthorized, forbidden } from '@/lib/api/guard'

describe('api guard responses', () => {
  it('unauthorized() returns 401 with { error: "Unauthorized" }', async () => {
    const res = unauthorized()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('forbidden() returns 403 with { error: "Forbidden" }', async () => {
    const res = forbidden()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })
})
