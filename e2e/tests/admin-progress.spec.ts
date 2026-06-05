import { test, expect } from '@playwright/test'

test.use({ storageState: 'e2e/auth/admin.json' })

test('/admin/progress 페이지 로드', async ({ page }) => {
  await page.goto('/admin/progress')
  await expect(page).toHaveURL('/admin/progress')
})

test('StatsBar 5개 항목 렌더링', async ({ page }) => {
  await page.goto('/admin/progress')

  // StatsBar는 칸반 fetch 완료 후 렌더링됨
  for (const label of ['미시작', '진행 중', '검토 중', '합격', '불합격']) {
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 10_000 })
  }
})

test('제출 상태 배지 하나 이상 렌더링', async ({ page }) => {
  await page.goto('/admin/progress')

  // 배지 텍스트 중 하나 이상이 화면에 존재해야 함
  const badgeTexts = ['합격', '검토 중', '불합격', '미제출']
  let found = false
  for (const text of badgeTexts) {
    const count = await page.getByText(text).count()
    if (count > 0) { found = true; break }
  }
  expect(found, '제출 상태 배지가 하나도 렌더링되지 않음').toBe(true)
})
