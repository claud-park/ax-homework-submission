import { describe, it, expect } from 'vitest'
import { parseAdminConfig } from '@/lib/admin/adminConfig'

describe('parseAdminConfig', () => {
  it('완전한 env에서 3계정 + old admin을 파싱한다', () => {
    const cfg = parseAdminConfig({
      ADMIN_ALEX_EMAIL: 'alex@x.io', ADMIN_ALEX_PASSWORD: 'pw1',
      ADMIN_CLAUD_EMAIL: 'claud@x.io', ADMIN_CLAUD_PASSWORD: 'pw2',
      ADMIN_JENNIFER_EMAIL: 'jen@x.io', ADMIN_JENNIFER_PASSWORD: 'pw3',
      OLD_ADMIN_EMAIL: 'old@x.io',
    })
    expect(cfg.accounts).toHaveLength(3)
    expect(cfg.accounts[0]).toEqual({ key: 'alex', email: 'alex@x.io', password: 'pw1', name: 'Alex' })
    expect(cfg.accounts[2].name).toBe('Jennifer')
    expect(cfg.oldAdminEmail).toBe('old@x.io')
  })

  it('email/password 한쪽만 있으면 그 계정은 제외한다', () => {
    const cfg = parseAdminConfig({ ADMIN_ALEX_EMAIL: 'alex@x.io' })
    expect(cfg.accounts).toHaveLength(0)
    expect(cfg.oldAdminEmail).toBeNull()
  })
})
