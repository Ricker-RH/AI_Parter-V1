import {expect, test, type Page} from '@playwright/test'
import {waitForHomeShell} from './performance-helpers'

async function openAt(page: Page, width: number) {
  await page.setViewportSize({width, height: 900})
  await page.goto('/en')
  await waitForHomeShell(page)
}

async function geometry(page: Page) {
  return page.locator('body').evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {display: getComputedStyle(element).display, left: rect.left, width: rect.width}
    }
    return {content: box('.content'), desktopNav: box('.desktop-nav'), overflow: document.documentElement.scrollWidth > window.innerWidth, rightRail: box('.right-rail')}
  })
}

test('ordinary public shell keeps its navigation left of content through desktop breakpoints', async ({page}) => {
  const measurements = new Map<number, Awaited<ReturnType<typeof geometry>>>()
  for (const width of [700, 768, 1024, 1149, 1150, 1255, 1256, 1327, 1328, 1440]) {
    await openAt(page, width)
    const current = await geometry(page)
    measurements.set(width, current)
    expect(current.overflow, `unexpected horizontal overflow at ${width}px`).toBe(false)
    expect(current.desktopNav?.left, `navigation must precede content at ${width}px`).toBeLessThan(current.content?.left ?? Infinity)
    expect(current.content?.width, `primary column must remain bounded at ${width}px`).toBeLessThanOrEqual(640)
    expect(current.rightRail?.display !== 'none', `recommendation visibility at ${width}px`).toBe(width >= 1328)
  }

  const primaryLeft = (width: number) => measurements.get(width)?.content?.left ?? Infinity
  expect(Math.abs(primaryLeft(1150) - primaryLeft(1149)), 'full-navigation breakpoint must not jump the primary column').toBeLessThanOrEqual(20)
  expect(Math.abs(primaryLeft(1256) - primaryLeft(1255)), 'recommendation threshold preparation must not move the primary column').toBeLessThanOrEqual(1)
  expect(Math.abs(primaryLeft(1328) - primaryLeft(1327)), 'showing recommendations must not move the primary column').toBeLessThanOrEqual(1)
})

test('ordinary public shell switches to the five-item mobile navigation below 700px', async ({page}) => {
  for (const width of [375, 430, 699]) {
    await openAt(page, width)
    const current = await geometry(page)
    await expect(page.locator('.mobile-nav')).toBeVisible()
    await expect(page.locator('.desktop-nav')).toBeHidden()
    expect(current.overflow, `unexpected horizontal overflow at ${width}px`).toBe(false)
  }
})

test('recommendations stay sticky beside a long public feed', async ({page}) => {
  await openAt(page, 1440)
  await page.locator('.content').evaluate((element) => { element.style.minHeight = '2000px' })

  await page.evaluate(() => window.scrollTo(0, 400))
  const firstOffset = await page.locator('.rail-sticky').evaluate((element) => element.getBoundingClientRect().top)
  await page.evaluate(() => window.scrollTo(0, 800))
  const secondOffset = await page.locator('.rail-sticky').evaluate((element) => element.getBoundingClientRect().top)

  expect(Math.abs(firstOffset), 'the rail must reach the viewport top after the feed scrolls').toBeLessThanOrEqual(1)
  expect(Math.abs(secondOffset - firstOffset), 'the rail must remain fixed while the feed continues scrolling').toBeLessThanOrEqual(1)
})
