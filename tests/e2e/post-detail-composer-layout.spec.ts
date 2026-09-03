import {readFileSync} from 'node:fs'
import {expect, test, type Page} from '@playwright/test'

const globalCss = readFileSync('apps/web/src/app/globals.css', 'utf8').replace(/^@import[^\n]+\n/, '')
const surfaceCss = readFileSync('apps/web/src/components/social/SocialSurface.module.css', 'utf8')
const viewports = [
  {width: 320, height: 780},
  {width: 375, height: 812},
  {width: 390, height: 844},
  {width: 430, height: 932},
  {width: 699, height: 900},
  {width: 700, height: 900},
  {width: 1184, height: 900},
]

function actions(index: number, longCounts = false) {
  const visibleCount = longCounts ? '9.9M' : String(index)
  return `<footer class="post-actions entity-actions comment-actions"><div class="post-actions__controls entity-actions__controls">${['Like', 'Reply', 'Bookmark', 'Share'].map((label) => `<button aria-label="${label} 9,876,543" class="post-action"><svg viewBox="0 0 24 24"></svg><span>${visibleCount}</span></button>`).join('')}</div><div class="post-actions__feedback entity-actions__feedback"></div></footer>`
}

function comment(index: number, reply = false, last = false) {
  return `<article class="comment-thread-item${reply ? ' comment-thread-item--reply' : ''}"${last ? ' data-last-comment' : ''}><div class="comment-avatar-rail"><span class="comment-avatar">A</span></div><div class="comment-thread-content"><strong>Author ${index}</strong><p>Responsive comment ${index}</p>${actions(index, true)}</div></article>`
}

async function renderDetail(page: Page, width: number, height: number) {
  await page.setViewportSize({width, height})
  const groups = Array.from({length: 8}, (_, index) => `<section class="comment-thread-group comment-thread-group--connected" data-group>${comment(index * 2 + 1)}${comment(index * 2 + 2, true, index === 7)}</section>`).join('')
  await page.setContent(`
    <head><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
    <main class="shell" data-mobile-top-bar="hidden" data-shell="public">
      <aside class="desktop-nav">Navigation</aside><section class="content"><article class="surface post-detail-page">
        <header class="header post-detail-header"><button class="post-detail-back">Back</button><h1>Post</h1></header>
        <div class="frame dockedViewport"><div aria-label="Comments" class="post-detail-scroll-region post-detail-content" data-composer-feedback="false" data-composer-mode="authenticated" data-replying="false" role="region" tabindex="0">
          <article class="post-card post-card--detail"><p>Post body</p>${actions(1)}</article>
          <section class="comments-section"><div class="comments-toolbar"><h2>Comments</h2><span>Chronological</span></div>
            <div class="post-detail-composer-dock"><form class="comment-composer comment-composer--primary"><span class="comment-composer-avatar">R</span><div class="comment-composer-field"><textarea aria-label="Write a comment" rows="1"></textarea><button aria-label="Comment" class="comment-submit" type="submit"><span class="comment-submit-visual"><svg viewBox="0 0 24 24"></svg></span></button></div><span class="interaction-error"></span></form></div>
            <div class="comment-thread">${groups}</div>
          </section>
        </div></div>
      </article></section><nav class="mobile-nav"><a class="mobile-link" href="#home">Home</a></nav>
    </main>`)
  await page.addStyleTag({content: `${globalCss}\n${surfaceCss}\nhtml, body { height: 100%; margin: 0; }`})
}

test('comment groups and shared action rows remain aligned at product breakpoints', async ({page}) => {
  for (const viewport of viewports) {
    await renderDetail(page, viewport.width, viewport.height)
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
      const root = box('[data-group] .comment-thread-item:not(.comment-thread-item--reply)')
      const reply = box('[data-group] .comment-thread-item--reply')
      const content = box('.post-card--detail')
      const rows = [...document.querySelectorAll<HTMLElement>('.entity-actions__controls')]
      const targets = [...document.querySelectorAll<HTMLElement>('.entity-actions__controls .post-action')]
      return {actionRowsCompact: rows.every((row) => row.getBoundingClientRect().width < content.width * .8), gap: targets[1]!.getBoundingClientRect().left - targets[0]!.getBoundingClientRect().right, noOverflow: document.documentElement.scrollWidth <= window.innerWidth, replyLeft: reply.left, rootLeft: root.left, targetsLargeEnough: targets.every((target) => target.getBoundingClientRect().height >= 44 && target.getBoundingClientRect().width >= 44)}
    })
    expect(geometry.noOverflow, `horizontal overflow at ${viewport.width}px`).toBe(true)
    expect(geometry.actionRowsCompact, `compact action rows at ${viewport.width}px`).toBe(true)
    expect(geometry.targetsLargeEnough, `44px targets at ${viewport.width}px`).toBe(true)
    expect(geometry.gap, `action gap at ${viewport.width}px`).toBeGreaterThanOrEqual(8)
    expect(geometry.replyLeft, `flat reply alignment at ${viewport.width}px`).toBeCloseTo(geometry.rootLeft, 0)
  }
})

test('the single composer is inline on desktop and docks above mobile navigation', async ({page}) => {
  for (const viewport of viewports) {
    await renderDetail(page, viewport.width, viewport.height)
    await expect(page.locator('form.comment-composer')).toHaveCount(1)
    await expect(page.locator('textarea')).toHaveCount(1)
    const geometry = await page.evaluate(() => {
      const dock = document.querySelector<HTMLElement>('.post-detail-composer-dock')!
      const nav = document.querySelector<HTMLElement>('.mobile-nav')!
      const toolbar = document.querySelector<HTMLElement>('.comments-toolbar')!.getBoundingClientRect()
      const thread = document.querySelector<HTMLElement>('.comment-thread')!.getBoundingClientRect()
      const rect = dock.getBoundingClientRect()
      return {dockBottom: rect.bottom, dockPosition: getComputedStyle(dock).position, dockTop: rect.top, navDisplay: getComputedStyle(nav).display, navTop: nav.getBoundingClientRect().top, threadTop: thread.top, toolbarBottom: toolbar.bottom}
    })
    expect(geometry.dockTop).toBeGreaterThanOrEqual(geometry.toolbarBottom - 1)
    if (viewport.width < 700) {
      expect(geometry.dockPosition).toBe('fixed')
      expect(geometry.navDisplay).not.toBe('none')
      expect(geometry.dockBottom).toBeLessThanOrEqual(geometry.navTop + 1)
      await page.locator('.post-detail-scroll-region').evaluate((element) => { element.scrollTop = 700 })
      const scrolledDock = await page.evaluate(() => {
        const dock = document.querySelector<HTMLElement>('.post-detail-composer-dock')!.getBoundingClientRect()
        const nav = document.querySelector<HTMLElement>('.mobile-nav')!.getBoundingClientRect()
        return {bottom: dock.bottom, top: dock.top, navTop: nav.top}
      })
      expect(scrolledDock.top, `composer remains visible after scrolling at ${viewport.width}px`).toBeGreaterThanOrEqual(0)
      expect(scrolledDock.bottom, `composer remains above navigation after scrolling at ${viewport.width}px`).toBeCloseTo(scrolledDock.navTop, 0)
      await page.locator('.post-detail-scroll-region').evaluate((element) => { element.scrollTop = element.scrollHeight })
      const bottom = await page.evaluate(() => {
        const last = document.querySelector<HTMLElement>('[data-last-comment]')!.getBoundingClientRect()
        const viewport = document.querySelector<HTMLElement>('.post-detail-scroll-region')!.getBoundingClientRect()
        const nav = document.querySelector<HTMLElement>('.mobile-nav')!.getBoundingClientRect()
        const dock = document.querySelector<HTMLElement>('.post-detail-composer-dock')!.getBoundingClientRect()
        return {dockTop: dock.top, lastBottom: last.bottom, viewportBottom: viewport.bottom, navTop: nav.top}
      })
      expect(bottom.lastBottom).toBeLessThanOrEqual(bottom.viewportBottom + 1)
      expect(bottom.lastBottom).toBeLessThanOrEqual(bottom.navTop + 1)
      expect(bottom.lastBottom).toBeLessThanOrEqual(bottom.dockTop + 1)
    } else {
      expect(geometry.dockPosition).toBe('static')
      expect(geometry.navDisplay).toBe('none')
      expect(geometry.threadTop).toBeGreaterThanOrEqual(geometry.dockBottom - 1)
    }
  }
})

test('crossing the 699px breakpoint preserves the one composer draft', async ({page}) => {
  await renderDetail(page, 699, 900)
  const input = page.getByRole('textbox', {name: 'Write a comment'})
  await input.fill('Unsent reply draft')
  await page.setViewportSize({width: 700, height: 900})
  await expect(input).toHaveValue('Unsent reply draft')
  await expect(page.locator('.post-detail-composer-dock')).toHaveCSS('position', 'static')
  await page.setViewportSize({width: 699, height: 900})
  await expect(input).toHaveValue('Unsent reply draft')
  await expect(page.locator('.post-detail-composer-dock')).toHaveCSS('position', 'fixed')
  await expect(page.locator('form.comment-composer')).toHaveCount(1)
})
