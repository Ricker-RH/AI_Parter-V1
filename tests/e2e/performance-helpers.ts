import type {Page} from '@playwright/test'

export async function waitForHomeOrUnavailable(page: Page) {
  await page.getByRole('heading', {name: 'Home'}).waitFor()
  await page.getByText(/Nothing here yet|Unable to load this page/).waitFor()
}
