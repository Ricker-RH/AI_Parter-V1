import {expect, test} from '@playwright/test'
import {waitForHomeShell} from './performance-helpers'

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))] ?? 0
}

test('ordinary navigation meets shell feedback and warm-route budgets', async ({page}, testInfo) => {
  const feedbackSamples: number[] = []
  const navigationSamples: number[] = []
  const skeletonSamples: number[] = []
  await page.goto('/en')
  await waitForHomeShell(page)
  await page.evaluate(() => {
    ;(window as Window & {__aifansCls?: number}).__aifansCls = 0
    new PerformanceObserver((entries) => { for (const entry of entries.getEntries() as PerformanceEntryList & Array<PerformanceEntry & {hadRecentInput?: boolean; value?: number}>) if (!entry.hadRecentInput) (window as Window & {__aifansCls?: number}).__aifansCls = ((window as Window & {__aifansCls?: number}).__aifansCls ?? 0) + (entry.value ?? 0) }).observe({type: 'layout-shift', buffered: true})
  })

  for (const href of ['/en/messages', '/en/notifications', '/en/profile', '/en'] as const) {
    const link = page.locator(`a[href="${href}"]:visible`).first()
    await expect(link).toBeVisible()
    const started = await page.evaluate(() => performance.now())
    await link.dispatchEvent('pointerdown')
    await expect(page.locator('.navigation-feedback')).toBeVisible()
    feedbackSamples.push(await page.evaluate((value) => performance.now() - value, started))
    await link.click()
    await page.waitForURL((url) => url.pathname === href)
    await page.locator('main').waitFor()
    navigationSamples.push(await page.evaluate((value) => performance.now() - value, started))
    const skeleton = page.locator('.route-skeleton')
    if (await skeleton.isVisible().catch(() => false)) skeletonSamples.push(await page.evaluate((value) => performance.now() - value, started))
  }

  const cls = await page.evaluate(() => (window as Window & {__aifansCls?: number}).__aifansCls ?? 0)
  const metrics = {feedback: {p50: percentile(feedbackSamples, .5), p75: percentile(feedbackSamples, .75), p95: percentile(feedbackSamples, .95)}, navigation: {p50: percentile(navigationSamples, .5), p75: percentile(navigationSamples, .75), p95: percentile(navigationSamples, .95)}, skeleton: skeletonSamples.length ? {p50: percentile(skeletonSamples, .5), p75: percentile(skeletonSamples, .75), p95: percentile(skeletonSamples, .95)} : null, cls}
  testInfo.annotations.push({type: 'navigation-performance', description: JSON.stringify(metrics)})
  expect(metrics.feedback.p75).toBeLessThanOrEqual(100)
  expect(metrics.navigation.p75).toBeLessThanOrEqual(800)
  expect(metrics.cls).toBeLessThan(.1)
  if (metrics.skeleton) expect(metrics.skeleton.p75).toBeLessThanOrEqual(150)
})
