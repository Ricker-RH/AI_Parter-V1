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
  for (const width of [700, 768, 1024, 1149, 1150, 1255, 1256, 1440]) {
    await openAt(page, width)
    const current = await geometry(page)
    expect(current.overflow, `unexpected horizontal overflow at ${width}px`).toBe(false)
    expect(current.desktopNav?.left, `navigation must precede content at ${width}px`).toBeLessThan(current.content?.left ?? Infinity)
    expect(current.content?.width, `primary column must remain bounded at ${width}px`).toBeLessThanOrEqual(640)
    expect(current.rightRail?.display !== 'none', `recommendation visibility at ${width}px`).toBe(width >= 1256)
  }
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
