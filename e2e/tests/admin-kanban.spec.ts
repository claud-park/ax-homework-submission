import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/auth/admin.json' })

test('칸반 보드 5개 컬럼 헤더 렌더링', async ({ page }) => {
  await page.goto('/admin/kanban')

  for (const label of ['미시작', '진행 중', '검토 중', '합격', '불합격']) {
    await expect(page.getByText(label).first()).toBeVisible()
  }
})

test('칸반 페이지: /admin/login으로 리다이렉트되지 않음', async ({ page }) => {
  await page.goto('/admin/kanban')
  await expect(page).not.toHaveURL('/admin/login')
})
