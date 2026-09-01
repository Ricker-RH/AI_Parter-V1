import type {Page} from '@playwright/test'

export async function waitForHomeShell(page: Page) {
  await page.getByRole('heading', {name: 'Home'}).waitFor()
}
