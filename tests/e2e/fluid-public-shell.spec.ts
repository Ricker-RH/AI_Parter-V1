import {expect, test, type Page} from '@playwright/test'
import {waitForHomeShell} from './performance-helpers'

async function waitForSettledShell(page: Page, path: string) {
  // Streaming temporarily stages another shell in a hidden React segment.
  // Measure the hydrated route, not its fallback or the staging fragment.
  await page.locator(`[data-route-ready="${path}"]`).waitFor({state: 'attached'})
  await expect(page.locator('.shell[data-shell="public"]')).toHaveCount(1)
}

async function openAt(page: Page, width: number) {
  await page.setViewportSize({width, height: 900})
  await page.goto('/en')
  await waitForSettledShell(page, '/en')
  await waitForHomeShell(page)
}

async function openMobileAt(page: Page, width: number, height: number, path = '/en') {
  await page.setViewportSize({width, height})
  await page.goto(path)
  await waitForSettledShell(page, path)
  await page.locator('.shell[data-shell="public"]').waitFor()
  if (path === '/en') await page.locator('article.post-card, [role="alert"]').or(page.getByText('Nothing here yet')).first().waitFor()
}

async function geometry(page: Page) {
  return page.locator('body').evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {display: getComputedStyle(element).display, left: rect.left, top: rect.top, width: rect.width}
    }
    return {content: box('.content'), desktopNav: box('.desktop-nav'), overflow: document.documentElement.scrollWidth > window.innerWidth, rightRail: box('.right-rail')}
  })
}

test('ordinary public shell keeps its navigation left of content through desktop breakpoints', async ({page}) => {
  const measurements = new Map<number, Awaited<ReturnType<typeof geometry>>>()
  for (const width of [700, 768, 1024, 1149, 1150, 1183, 1184, 1255, 1256, 1327, 1328, 1440]) {
    await openAt(page, width)
    const current = await geometry(page)
    measurements.set(width, current)
    expect(current.overflow, `unexpected horizontal overflow at ${width}px`).toBe(false)
    expect(current.desktopNav?.left, `navigation must precede content at ${width}px`).toBeLessThan(current.content?.left ?? Infinity)
    expect(current.content?.width, `primary column must remain bounded at ${width}px`).toBeLessThanOrEqual(640)
    expect(current.rightRail?.display !== 'none', `recommendation visibility at ${width}px`).toBe(width >= 1328)
  }

  const primaryLeft = (width: number) => measurements.get(width)?.content?.left ?? Infinity
  expect(Math.abs(primaryLeft(1184) - primaryLeft(1183)), 'full-navigation breakpoint must not jump the primary column').toBeLessThanOrEqual(1)
  expect(Math.abs(primaryLeft(1256) - primaryLeft(1255)), 'recommendation threshold preparation must not move the primary column').toBeLessThanOrEqual(1)
  expect(Math.abs(primaryLeft(1328) - primaryLeft(1327)), 'showing recommendations must not move the primary column').toBeLessThanOrEqual(1)
})

test('ordinary public shell switches to the four-item mobile navigation below 700px', async ({page}) => {
  for (const width of [375, 430, 699]) {
    await openAt(page, width)
    const current = await geometry(page)
    await expect(page.locator('.mobile-nav')).toBeVisible()
    await expect(page.locator('.mobile-nav a')).toHaveText(['Home', 'Channels', 'Messages', 'Me'])
    await expect(page.locator('.desktop-nav')).toBeHidden()
    expect(current.overflow, `unexpected horizontal overflow at ${width}px`).toBe(false)
  }
})

test('mobile public shell owns one bounded viewport while messages navigation remains fixed', async ({page}) => {
  for (const viewport of [{width: 375, height: 812}, {width: 390, height: 844}, {width: 414, height: 896}]) {
    await openMobileAt(page, viewport.width, viewport.height)
    const publicGeometry = await page.locator('.shell[data-shell="public"]').evaluate((shell) => {
      const root = document.scrollingElement
      const content = shell.querySelector<HTMLElement>('.content')
      const nav = shell.querySelector<HTMLElement>('.mobile-nav')
      if (!root || !content || !nav) throw new Error('Expected complete public shell')
      const contentRect = content.getBoundingClientRect()
      const navRect = nav.getBoundingClientRect()
      return {
        contentBottom: contentRect.bottom,
        navPosition: getComputedStyle(nav).position,
        navTop: navRect.top,
        rootClientHeight: root.clientHeight,
        rootScrollHeight: root.scrollHeight,
      }
    })
    expect(publicGeometry.rootScrollHeight).toBe(publicGeometry.rootClientHeight)
    expect(Math.abs(publicGeometry.contentBottom - publicGeometry.navTop)).toBeLessThanOrEqual(1)
    expect(publicGeometry.navPosition).toBe('static')
  }

  await openMobileAt(page, 390, 844, '/en/posts/00000000-0000-4000-8000-000000000001')
  await expect(page.locator('.shell[data-shell="public"]')).toHaveAttribute('data-mobile-top-bar', 'hidden')
  const detailGeometry = await page.locator('.shell[data-shell="public"] .content').evaluate((content) => {
    const route = content.firstElementChild as HTMLElement | null
    if (!route) throw new Error('Expected detail route content')
    const contentRect = content.getBoundingClientRect()
    const routeRect = route.getBoundingClientRect()
    return {contentBottom: contentRect.bottom, contentTop: contentRect.top, routeBottom: routeRect.bottom, routeTop: routeRect.top}
  })
  expect(Math.abs(detailGeometry.routeTop - detailGeometry.contentTop)).toBeLessThanOrEqual(1)
  expect(Math.abs(detailGeometry.routeBottom - detailGeometry.contentBottom)).toBeLessThanOrEqual(1)

  await openMobileAt(page, 390, 844)
  const messagesNavPosition = await page.locator('.shell[data-shell="public"]').evaluate((shell) => {
    shell.classList.add('messages-shell')
    shell.setAttribute('data-shell', 'messages')
    const nav = shell.querySelector<HTMLElement>('.mobile-nav')
    if (!nav) throw new Error('Expected mobile navigation')
    return getComputedStyle(nav).position
  })
  expect(messagesNavPosition).toBe('fixed')
})

test('refresh preserves public content geometry at responsive boundaries', async ({page}) => {
  for (const width of [430, 699, 700, 1183, 1184, 1440]) {
    await openAt(page, width)
    const before = await geometry(page)
    await page.reload()
    await waitForSettledShell(page, '/en')
    await waitForHomeShell(page)
    const after = await geometry(page)

    expect(after.content, `content geometry changed after refresh at ${width}px`).toEqual(before.content)
    expect(after.overflow, `refresh introduced horizontal overflow at ${width}px`).toBe(false)
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
