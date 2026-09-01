import {chromium} from '@playwright/test'

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const consoleErrors = []

async function capture(path, viewport, screenshot) {
  const page = await browser.newPage({viewport, colorScheme: screenshot.includes('dark') ? 'dark' : 'light'})
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(`${path}: ${message.text()}`)
  })
  await page.goto(`http://127.0.0.1:3000${path}`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({path: `.superpowers/sdd/${screenshot}`, fullPage: true})
  const composeCount = await page.getByRole('button', {name: /post|publish|compose|发帖|发布/i}).count()
  if (composeCount !== 0) throw new Error(`${path} exposes a compose action`)
  await page.close()
}

await capture('/en', {width: 1440, height: 1000}, 'web-en-desktop.png')
await capture('/zh-CN', {width: 390, height: 844}, 'web-zh-mobile.png')
await capture('/en/settings', {width: 1440, height: 1000}, 'web-settings-dark.png')

await browser.close()
if (consoleErrors.length) throw new Error(consoleErrors.join('\n'))
