import type {Page} from '@playwright/test'

export async function waitForHomeShell(page: Page) {
  await page.getByRole('heading', {name: 'Home'}).waitFor()
  await page.locator('article.post-card, [role="alert"]').or(page.getByText('Nothing here yet')).first().waitFor()
}
