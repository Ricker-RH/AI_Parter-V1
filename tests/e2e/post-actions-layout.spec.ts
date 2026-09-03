import {readFileSync} from 'node:fs'
import {expect, test} from '@playwright/test'

test('320px Feed actions contain compact counts without shrinking icons or targets', async ({browserName, page}) => {
  test.skip(browserName !== 'chromium', 'Chromium geometry contract')
  const stylesheet = readFileSync('apps/web/src/app/globals.css', 'utf8')
  const actions = [
    ['Like 12,345', '12K'],
    ['Comments 56,789', '57K'],
    ['Bookmark 123,456', '120K'],
    ['Share 987,654', '990K'],
  ]
  const markup = actions.map(([label, count]) => `<button aria-label="${label}" class="post-action"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12h20"/></svg><span aria-hidden="true">${count}</span></button>`).join('')

  await page.setViewportSize({width: 320, height: 800})
  await page.setContent(`<article class="post-card"><div class="post-layout"><div></div><div class="post-content"><footer class="post-actions"><div class="post-actions__controls">${markup}</div></footer></div></div></article>`)
  await page.addStyleTag({content: stylesheet})

  const geometry = await page.locator('.post-action').evaluateAll((elements) => elements.map((element) => {
    const action = element.getBoundingClientRect()
    const children = Array.from(element.children).map((child) => child.getBoundingClientRect())
    const icon = element.querySelector('svg')!.getBoundingClientRect()
    const count = element.querySelector('span')!
    return {
      action: {height: action.height, left: action.left, right: action.right},
      content: {left: Math.min(...children.map((child) => child.left)), right: Math.max(...children.map((child) => child.right))},
      count: {clientWidth: count.clientWidth, scrollWidth: count.scrollWidth},
      icon: {height: icon.height, width: icon.width},
    }
  }))

  expect(geometry).toHaveLength(4)
  for (const item of geometry) {
    const evidence = JSON.stringify(item)
    expect(item.action.height, evidence).toBeGreaterThanOrEqual(44)
    expect(item.content.left, evidence).toBeGreaterThanOrEqual(item.action.left)
    expect(item.content.right, evidence).toBeLessThanOrEqual(item.action.right)
    expect(item.count.scrollWidth, evidence).toBeLessThanOrEqual(item.count.clientWidth)
    expect(item.icon, evidence).toEqual({height: 20, width: 20})
  }
})
