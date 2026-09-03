import type {Page} from '@playwright/test'

export async function waitForHomeShell(page: Page) {
  await page.locator('.shell[data-shell="public"] .content').waitFor()
  await page.locator('article.post-card, [role="alert"]').or(page.getByText('Nothing here yet')).first().waitFor()
}
