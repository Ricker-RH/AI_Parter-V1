import {expect, test} from '@playwright/test'
import {waitForHomeOrUnavailable} from './performance-helpers'

test('anonymous home exposes localized metadata and a real empty or unavailable state', async ({page}) => {
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('AIFANS')
  await waitForHomeOrUnavailable(page)
})

test('the responsive application shell is available on desktop and mobile', async ({page}, testInfo) => {
  await page.goto('/en')
  await waitForHomeOrUnavailable(page)
  if (testInfo.project.name === 'chromium-desktop') {
    await expect(page.locator('.desktop-nav')).toBeVisible()
  } else {
    await expect(page.locator('.mobile-nav')).toBeVisible()
  }
})
