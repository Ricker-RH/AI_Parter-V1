import {expect, test} from '@playwright/test'
import {waitForHomeShell} from './performance-helpers'

test('anonymous home exposes localized metadata without prescribing live API state', async ({page}) => {
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('AIFANS')
  await waitForHomeShell(page)
})

test('the responsive application shell hydrates without failing Next assets', async ({page}, testInfo) => {
  const nextAssetFailures: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/_next/') && response.status() >= 400) nextAssetFailures.push(`${response.status()} ${response.url()}`)
  })
  await page.goto('/en')
  await waitForHomeShell(page)
  await expect.poll(() => page.evaluate(() => {
    const browser = window as Window & {__aifansFoundationSignal?: string}
    browser.__aifansFoundationSignal = 'client-script-ran'
    return browser.__aifansFoundationSignal
  })).toBe('client-script-ran')
  expect(nextAssetFailures).toEqual([])
  if (testInfo.project.name === 'chromium-desktop') {
    await expect(page.locator('.desktop-nav')).toBeVisible()
  } else {
    await expect(page.locator('.mobile-nav')).toBeVisible()
  }
})
