import { chromium, type FullConfig } from '@playwright/test'
import { injectChampionSession } from './e2e/helpers/inject-session'
import * as fs from 'fs'

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:3000'

  fs.mkdirSync('e2e/auth', { recursive: true })

  const browser = await chromium.launch()

  // Admin: 실제 로그인 폼 사용
  {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${baseURL}/admin/login`)
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!)
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!)
    await page.click('button[type="submit"]')
    await page.waitForURL(`${baseURL}/admin`, { timeout: 15_000 })
    await context.storageState({ path: 'e2e/auth/admin.json' })
    await context.close()
  }

  // Champion: Supabase 세션 쿠키 주입
  {
    const context = await browser.newContext()
    await injectChampionSession(context)
    const page = await context.newPage()
    await page.goto(`${baseURL}/`)
    const finalUrl = page.url()
    if (!finalUrl.startsWith(`${baseURL}/`) || finalUrl.includes('/login')) {
      throw new Error(`Champion session injection failed — redirected to: ${finalUrl}`)
    }
    await context.storageState({ path: 'e2e/auth/champion.json' })
    await context.close()
  }

  await browser.close()
}
