import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('미인증: / → /login 리다이렉트', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/login')
})

test('미인증: /admin/kanban → /admin/login 리다이렉트', async ({ page }) => {
  await page.goto('/admin/kanban')
  await expect(page).toHaveURL('/admin/login')
})

test('미인증: /admin/progress → /admin/login 리다이렉트', async ({ page }) => {
  await page.goto('/admin/progress')
  await expect(page).toHaveURL('/admin/login')
})

test('챔피언 세션: /admin/kanban → /admin/login 리다이렉트', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/auth/champion.json' })
  const page = await context.newPage()
  await page.goto('/admin/kanban')
  await expect(page).toHaveURL('/admin/login')
  await context.close()
})
