import {readFileSync} from 'node:fs'
import {expect, test, type Page} from '@playwright/test'

const workspaceCss = readFileSync('apps/web/src/components/chat/MessagesWorkspace.module.css', 'utf8')
const globalCss = readFileSync('apps/web/src/app/globals.css', 'utf8')

async function renderWorkspace(page: Page, width: number) {
  await page.setViewportSize({width, height: 800})
  await page.setContent(`
    <main class="workspace" data-selected="true">
      <aside class="listPane">
        <header class="sectionHeader"><div class="titleRow"><h1>Messages</h1></div></header>
        <a class="notificationRow" href="#detail"><span class="avatar">A</span><span class="notificationCopy"><strong>Notification</strong></span></a>
      </aside>
      <section class="detailPane notificationDetailPane">
        <header class="detailHeader"><a class="back" href="?cursor=stable">Back</a><h2>Notification</h2></header>
        <article class="notificationDetail"><button class="notification-read" type="button">Retry marking as read</button></article>
      </section>
    </main>
  `)
  await page.addStyleTag({content: `${globalCss}\n${workspaceCss}\nhtml, body { margin: 0; } *, *::before, *::after { box-sizing: border-box; } .workspace { height: 800px; }`})
}

test('notification workspace has executable responsive geometry at product breakpoints', async ({browserName, page}) => {
  test.skip(browserName !== 'chromium', 'Chromium geometry contract')

  for (const width of [320, 375, 699, 700, 1184]) {
    await renderWorkspace(page, width)
    const geometry = await page.locator('.workspace').evaluate((workspace) => {
      const list = workspace.querySelector<HTMLElement>('.listPane')!
      const detail = workspace.querySelector<HTMLElement>('.detailPane')!
      const back = workspace.querySelector<HTMLElement>('.back')!
      const retry = workspace.querySelector<HTMLElement>('.notification-read')!
      const rect = (element: HTMLElement) => element.getBoundingClientRect()
      return {
        back: {display: getComputedStyle(back).display, height: rect(back).height},
        detail: rect(detail).width,
        list: {display: getComputedStyle(list).display, width: rect(list).width},
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        retryHeight: rect(retry).height,
        workspace: rect(workspace).width,
      }
    })

    expect(geometry.overflow, `horizontal overflow at ${width}px`).toBe(false)
    expect(geometry.retryHeight, `retry target at ${width}px`).toBeGreaterThanOrEqual(44)
    if (width < 700) {
      expect(geometry.list.display, `list visibility at ${width}px`).toBe('none')
      expect(geometry.detail, `detail width at ${width}px`).toBe(width)
      expect(geometry.back.display, `back visibility at ${width}px`).not.toBe('none')
      expect(geometry.back.height, `back target at ${width}px`).toBeGreaterThanOrEqual(44)
    } else {
      expect(geometry.list.width, `list width at ${width}px`).toBeGreaterThanOrEqual(300)
      expect(geometry.list.width, `list width at ${width}px`).toBeLessThanOrEqual(380)
      expect(geometry.detail + geometry.list.width, `pane fit at ${width}px`).toBeCloseTo(geometry.workspace, 0)
      expect(geometry.back.display, `desktop back visibility at ${width}px`).toBe('none')
    }
  }
})
