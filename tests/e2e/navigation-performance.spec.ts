import {expect, test} from '@playwright/test'
import type {Locator, Page} from '@playwright/test'
import {waitForHomeShell} from './performance-helpers'

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))] ?? 0
}

function routeIdentity(href: string) {
  const url = new URL(href, 'http://127.0.0.1')
  return `${url.pathname}${url.search}`
}

function observeAppearance(page: Page, selector: string) {
  return page.evaluate((target) => new Promise<number>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(target)) return
      observer.disconnect()
      resolve(performance.now())
    })
    observer.observe(document.body, {childList: true, subtree: true})
    if (document.querySelector(target)) {
      observer.disconnect()
      resolve(performance.now())
    }
  }), selector)
}

async function activateNavigation({expectSkeleton=false, page, href, link}: {expectSkeleton?: boolean; page: Page; href: string; link: Locator}) {
  const targetRoute = routeIdentity(href)
  const feedback = page.locator('.navigation-feedback')
  const skeleton = page.locator('.route-skeleton')
  const feedbackAppeared = observeAppearance(page, '.navigation-feedback')
  const skeletonAppeared = expectSkeleton ? observeAppearance(page, '.route-skeleton') : null
  const destination = page.waitForURL((url) => `${url.pathname}${url.search}` === targetRoute)
  const started = await page.evaluate(() => performance.now())

  await link.click()
  const [feedbackAt] = await Promise.all([feedbackAppeared, destination])
  const feedbackMs = feedbackAt - started
  const skeletonMs = skeletonAppeared ? (await skeletonAppeared) - started : null
  if (expectSkeleton) await skeleton.waitFor({state: 'hidden'})
  await page.waitForFunction((route) => document.querySelector('[data-route-ready]')?.getAttribute('data-route-ready') === route, targetRoute)
  const navigationMs = await page.evaluate((value) => performance.now() - value, started)

  return {feedbackMs, navigationMs, skeletonMs}
}

// This test is run only by playwright.production.config.ts against a built Next production server.
test('anonymous Home and Search navigation meets production feedback budgets', async ({page}, testInfo) => {
  const warmFeedbackSamples: number[] = []
  const warmNavigationSamples: number[] = []
  await page.goto('/en')
  await waitForHomeShell(page)
  await expect(page.locator('a[href*="visualType"]')).toHaveCount(0)
  await page.evaluate(() => {
    ;(window as Window & {__aifansCls?: number}).__aifansCls = 0
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries() as PerformanceEntryList & Array<PerformanceEntry & {hadRecentInput?: boolean; value?: number}>) {
        if (!entry.hadRecentInput) (window as Window & {__aifansCls?: number}).__aifansCls = ((window as Window & {__aifansCls?: number}).__aifansCls ?? 0) + (entry.value ?? 0)
      }
    }).observe({type: 'layout-shift', buffered: true})
  })

  const coldSearchTransition = {href: '/en/search', link: () => page.locator('a[href="/en/search"]:visible').first(), ready: () => page.getByRole('heading', {exact: true, name: 'Search'}).waitFor()}
  const coldSearchSample = await activateNavigation({expectSkeleton: true, page, href: coldSearchTransition.href, link: coldSearchTransition.link()})
  await coldSearchTransition.ready()
  expect(coldSearchSample.skeletonMs).not.toBeNull()
  expect(coldSearchSample.feedbackMs).toBeLessThanOrEqual(100)
  expect(coldSearchSample.navigationMs).toBeLessThanOrEqual(800)
  expect(coldSearchSample.skeletonMs!).toBeLessThanOrEqual(150)

  const warmTransitions = Array.from({length: 10}, (_value, index) => index % 2 === 0
    ? {href: '/en', link: () => page.locator('a[href="/en"]:visible').first(), ready: () => waitForHomeShell(page)}
    : {href: '/en/search', link: () => page.locator('a[href="/en/search"]:visible').first(), ready: () => page.getByRole('heading', {exact: true, name: 'Search'}).waitFor()})

  for (const transition of warmTransitions) {
    const sample = await activateNavigation({page, href: transition.href, link: transition.link()})
    await transition.ready()
    warmFeedbackSamples.push(sample.feedbackMs)
    warmNavigationSamples.push(sample.navigationMs)
  }

  const cls = await page.evaluate(() => (window as Window & {__aifansCls?: number}).__aifansCls ?? 0)
  const metrics = {
    productionPlaywrightConfig: 'playwright.production.config.ts',
    coldSearch: {feedback: coldSearchSample.feedbackMs, navigation: coldSearchSample.navigationMs, skeleton: coldSearchSample.skeletonMs},
    warm: {
      sampleCount: warmNavigationSamples.length,
      feedback: {p50: percentile(warmFeedbackSamples, .5), p75: percentile(warmFeedbackSamples, .75), p95: percentile(warmFeedbackSamples, .95)},
      navigation: {p50: percentile(warmNavigationSamples, .5), p75: percentile(warmNavigationSamples, .75), p95: percentile(warmNavigationSamples, .95)},
    },
    cls,
  }
  testInfo.annotations.push({type: 'navigation-performance', description: JSON.stringify(metrics)})

  expect(warmFeedbackSamples).toHaveLength(10)
  expect(warmNavigationSamples).toHaveLength(10)
  expect(metrics.warm.feedback.p75).toBeLessThanOrEqual(100)
  expect(metrics.warm.navigation.p75).toBeLessThanOrEqual(800)
  expect(metrics.cls).toBeLessThan(.1)
})
