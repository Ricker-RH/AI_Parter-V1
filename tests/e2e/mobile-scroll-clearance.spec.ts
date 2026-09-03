import {readFileSync} from 'node:fs'
import {expect, test, type Page} from '@playwright/test'

const globalCss = readFileSync('apps/web/src/app/globals.css', 'utf8').replace(/^@import[^\n]+\n/, '')
const globalCssWithoutHas = globalCss.replace(/^.*:has\(.*\).*\{[^{}]*\}\s*$/gm, '')
const surfaceCss = readFileSync('apps/web/src/components/social/SocialSurface.module.css', 'utf8')
const viewports = [
  {width: 375, height: 812},
  {width: 699, height: 900},
  {width: 700, height: 900},
  {width: 1024, height: 900},
  {width: 1440, height: 900},
]
type ComposerMode = 'authenticated' | 'signin' | 'loading'
type DetailState = {feedback?: boolean; mode?: ComposerMode; replying?: boolean}

function cards(count: number) {
  return Array.from({length: count}, (_, index) => `<article class="post-card"${index === count - 1 ? ' data-last-card' : ''}><div class="post-layout"><span class="avatar">A</span><div class="post-content"><strong>Author ${index + 1}</strong><p class="post-body">Enough content to make the social surface scroll.</p></div></div></article>`).join('')
}

function comments(count: number) {
  return Array.from({length: count}, (_, index) => `<section class="comment-thread-group"><article class="comment-thread-item"${index === count - 1 ? ' data-last-card' : ''}><div class="comment-avatar-rail"><span class="comment-avatar">A</span></div><div class="comment-thread-content"><strong>Author ${index + 1}</strong><p>Enough content to make the detail surface scroll.</p></div></article></section>`).join('')
}

async function renderSurface(page: Page, width: number, height: number, detailState?: DetailState, safeAreaBottom = 0) {
  await page.setViewportSize({width, height})
  const mode = detailState?.mode ?? 'authenticated'
  const replying = detailState?.replying ?? false
  const feedback = detailState?.feedback ?? false
  const composer = mode === 'authenticated'
    ? `<form class="comment-composer comment-composer--primary"><span class="comment-composer-avatar">A</span><div class="comment-composer-field"><textarea aria-label="Write a comment" rows="1"></textarea><button aria-label="Send" class="comment-submit" type="button"><span class="comment-submit-visual">Send</span></button></div><span class="interaction-error">${feedback ? 'Unable to send' : ''}</span></form>`
    : mode === 'signin'
      ? '<p class="comment-signin comment-signin--primary"><a href="#signin">Sign in to comment</a></p>'
      : '<div aria-busy="true" aria-label="Comments" class="comment-auth-loading" role="status"><span></span></div>'
  const viewport = detailState
    ? `<div class="viewport dockedViewport" data-social-surface-viewport data-social-surface-viewport-layout="docked"><div aria-label="Comments" class="post-detail-scroll-region post-detail-content" data-composer-feedback="${feedback}" data-composer-mode="${mode}" data-replying="${replying}" role="region" tabindex="0"><article class="post-card post-card--detail">Post</article><section class="comments-section"><div class="comments-toolbar"><h2>Comments</h2></div><div class="post-detail-composer-dock">${replying ? '<div class="comment-reply-target"><span>Replying to @author</span><button type="button">Cancel</button></div>' : ''}${composer}</div><div class="comment-thread">${comments(12)}</div></section></div></div>`
    : `<div class="viewport" data-social-surface-viewport data-social-surface-viewport-layout="scroll">${cards(12)}</div>`

  await page.setContent(`
    <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head>
    <main class="shell" data-mobile-top-bar="hidden" data-shell="public">
      <section class="content"><article class="surface ${detailState ? 'post-detail-page' : 'home-page'}"><header class="header"><div class="page-header">Header</div></header><div class="frame" data-social-surface-frame>${viewport}</div></article></section>
      <nav class="mobile-nav"><a class="mobile-link" href="#home">Home</a></nav>
    </main>`)
  await page.evaluate(() => document.documentElement.setAttribute('data-route-shell', 'public'))
  await page.addStyleTag({content: `${globalCssWithoutHas}\n${surfaceCss}\nhtml, body { height: 100%; margin: 0; }${safeAreaBottom ? `\n:root { --mobile-safe-area-bottom: ${safeAreaBottom}px; }` : ''}`})
}

test('mobile list scroll surfaces end above the in-flow navigation with breathing room only', async ({page}) => {
  for (const viewport of viewports) {
    await renderSurface(page, viewport.width, viewport.height)
    await page.locator('[data-social-surface-viewport]').evaluate((element) => { element.scrollTop = element.scrollHeight })
    const geometry = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('[data-social-surface-viewport]')!
      const last = document.querySelector<HTMLElement>('[data-last-card]')!.getBoundingClientRect()
      const nav = document.querySelector<HTMLElement>('.mobile-nav')!
      return {
        gap: scroll.getBoundingClientRect().bottom - last.bottom,
        navPosition: getComputedStyle(nav).position,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        tailHeight: Number.parseFloat(getComputedStyle(scroll, '::after').height) || 0,
      }
    })
    expect(geometry.overflow, `horizontal overflow at ${viewport.width}px`).toBe(false)
    if (viewport.width < 700) {
      expect(geometry.navPosition).toBe('static')
      expect(geometry.tailHeight).toBe(16)
      expect(geometry.gap).toBeGreaterThanOrEqual(15)
      expect(geometry.gap).toBeLessThan(50)
    } else {
      expect(geometry.tailHeight).toBe(0)
      expect(Math.abs(geometry.gap)).toBeLessThanOrEqual(1)
    }
  }
})

test('the public document cannot carry the shared mobile navigation while content scrolls', async ({page}) => {
  await renderSurface(page, 375, 812)
  const before = await page.locator('.mobile-nav').boundingBox()

  await page.evaluate(() => {
    const overflowProbe = document.createElement('div')
    overflowProbe.style.height = '2000px'
    document.body.append(overflowProbe)
    window.scrollTo(0, 600)
  })

  const after = await page.locator('.mobile-nav').boundingBox()
  const documentScroll = await page.evaluate(() => window.scrollY)
  expect(documentScroll).toBe(0)
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 0)
})

test('a non-zero safe area expands the in-flow navigation and keeps the composer docked above it', async ({page}) => {
  await renderSurface(page, 375, 812, {}, 24)
  await page.locator('.post-detail-scroll-region').evaluate((element) => { element.scrollTop = element.scrollHeight })
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.shell')!
    const content = document.querySelector<HTMLElement>('.content')!.getBoundingClientRect()
    const last = document.querySelector<HTMLElement>('[data-last-card]')!.getBoundingClientRect()
    const dock = document.querySelector<HTMLElement>('.post-detail-composer-dock')!.getBoundingClientRect()
    const navElement = document.querySelector<HTMLElement>('.mobile-nav')!
    const nav = navElement.getBoundingClientRect()
    return {clearance: dock.top - last.bottom, contentBottom: content.bottom, dockBottom: dock.bottom, navHeight: nav.height, navPaddingBottom: Number.parseFloat(getComputedStyle(navElement).paddingBottom), navTop: nav.top, shellHeight: shell.getBoundingClientRect().height}
  })
  expect(geometry.navHeight).toBe(74)
  expect(geometry.navPaddingBottom).toBe(24)
  expect(geometry.dockBottom).toBeCloseTo(geometry.navTop, 0)
  expect(geometry.contentBottom).toBeCloseTo(geometry.navTop, 0)
  expect(geometry.clearance).toBeGreaterThanOrEqual(15)
  expect(geometry.shellHeight).toBe(812)
})

test('every reachable composer state keeps a bounded detail reserve without :has support', async ({page}) => {
  const states: Array<Required<DetailState>> = [
    {feedback: false, mode: 'authenticated', replying: false},
    {feedback: false, mode: 'authenticated', replying: true},
    {feedback: true, mode: 'authenticated', replying: false},
    {feedback: true, mode: 'authenticated', replying: true},
    {feedback: false, mode: 'signin', replying: false},
    {feedback: false, mode: 'signin', replying: true},
    {feedback: false, mode: 'loading', replying: false},
    {feedback: false, mode: 'loading', replying: true},
  ]
  for (const width of [375, 699]) {
    for (const state of states) {
      await renderSurface(page, width, 900, state)
      await page.locator('.post-detail-scroll-region').evaluate((element) => { element.scrollTop = element.scrollHeight })
      const geometry = await page.evaluate(() => {
        const scroll = document.querySelector<HTMLElement>('.post-detail-scroll-region')!
        const last = document.querySelector<HTMLElement>('[data-last-card]')!.getBoundingClientRect()
        const dock = document.querySelector<HTMLElement>('.post-detail-composer-dock')!.getBoundingClientRect()
        return {clearance: dock.top - last.bottom, dockHeight: dock.height, tailHeight: Number.parseFloat(getComputedStyle(scroll, '::after').height) || 0}
      })
      const context = `${width}px ${JSON.stringify(state)}: ${JSON.stringify(geometry)}`
      expect(geometry.tailHeight - geometry.dockHeight, `reserve ${context}`).toBeGreaterThanOrEqual(15)
      expect(geometry.tailHeight - geometry.dockHeight, `reserve ${context}`).toBeLessThanOrEqual(18)
      expect(geometry.clearance, `clearance ${context}`).toBeGreaterThanOrEqual(15)
      expect(geometry.clearance, `clearance ${context}`).toBeLessThanOrEqual(18)
    }
  }
})

test('mobile detail scroll surfaces clear the fixed composer without a desktop tail reserve', async ({page}) => {
  for (const viewport of viewports) {
    await renderSurface(page, viewport.width, viewport.height, {})
    await page.locator('.post-detail-scroll-region').evaluate((element) => { element.scrollTop = element.scrollHeight })
    const geometry = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('.post-detail-scroll-region')!
      const last = document.querySelector<HTMLElement>('[data-last-card]')!.getBoundingClientRect()
      const dock = document.querySelector<HTMLElement>('.post-detail-composer-dock')!.getBoundingClientRect()
      const nav = document.querySelector<HTMLElement>('.mobile-nav')!.getBoundingClientRect()
      const form = document.querySelector<HTMLElement>('.comment-composer--primary')!.getBoundingClientRect()
      const field = document.querySelector<HTMLElement>('.comment-composer-field')!.getBoundingClientRect()
      return {
        clearance: dock.top - last.bottom,
        clientHeight: scroll.clientHeight,
        dockHeight: dock.height,
        fieldHeight: field.height,
        formHeight: form.height,
        dockBottom: dock.bottom,
        navTop: nav.top,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollHeight: scroll.scrollHeight,
        scrollTop: scroll.scrollTop,
        tailHeight: Number.parseFloat(getComputedStyle(scroll, '::after').height) || 0,
      }
    })
    expect(geometry.overflow, `horizontal overflow at ${viewport.width}px`).toBe(false)
    if (viewport.width < 700) {
      const reserveGap = geometry.tailHeight - geometry.dockHeight
      expect(reserveGap, `detail reserve at ${viewport.width}px: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(15)
      expect(reserveGap, `detail reserve at ${viewport.width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(18)
      expect(geometry.clearance, `detail clearance at ${viewport.width}px: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(15)
      expect(geometry.clearance, `detail clearance at ${viewport.width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(18)
      expect(geometry.dockBottom).toBeCloseTo(geometry.navTop, 0)
    } else {
      expect(geometry.tailHeight).toBe(0)
    }
  }
})
