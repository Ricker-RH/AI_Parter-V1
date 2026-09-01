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
  const pageErrors: string[] = []
  const accountRequest = page.waitForRequest((request) => new URL(request.url()).origin === 'http://127.0.0.1:3000' && new URL(request.url()).pathname === '/api/account')
  page.on('response', (response) => {
    if (response.url().includes('/_next/') && response.status() >= 400) nextAssetFailures.push(`${response.status()} ${response.url()}`)
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/en')
  await waitForHomeShell(page)
  await expect(accountRequest).resolves.toBeDefined()
  expect(nextAssetFailures).toEqual([])
  expect(pageErrors).toEqual([])
  if (testInfo.project.name === 'chromium-desktop') {
    await expect(page.locator('.desktop-nav')).toBeVisible()
  } else {
    await expect(page.locator('.mobile-nav')).toBeVisible()
  }
})
