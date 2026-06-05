import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/auth/champion.json' })

test('챔피언 세션: / 접근 가능', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/')
  await expect(page).not.toHaveURL('/login')
})

test('챔피언 세션: /charter 접근 가능', async ({ page }) => {
  await page.goto('/charter')
  await expect(page).toHaveURL('/charter')
})

test('챔피언 세션: /milestones 접근 가능', async ({ page }) => {
  await page.goto('/milestones')
  await expect(page).toHaveURL('/milestones')
})

test('챔피언 세션: /admin/kanban → /admin/login 리다이렉트', async ({ page }) => {
  await page.goto('/admin/kanban')
  await expect(page).toHaveURL('/admin/login')
})
