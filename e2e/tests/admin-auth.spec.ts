import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('올바른 자격증명 → 로그인 후 /admin 이동', async ({ page }) => {
  await page.goto('/admin/login')
  await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!)
  await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/admin', { timeout: 10_000 })
})

test('잘못된 비밀번호 → 에러 메시지 표시', async ({ page }) => {
  await page.goto('/admin/login')
  await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!)
  await page.fill('input[type="password"]', 'wrong-password-12345')
  await page.click('button[type="submit"]')
  await expect(page.getByText('관리자 계정이 아니거나 비밀번호가 틀렸습니다.')).toBeVisible()
})
