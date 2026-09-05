import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'

it('uses the full viewport for standalone and dynamic viewport for browser chrome',()=>{
  const css=readFileSync(process.cwd().endsWith('/apps/web')?'src/app/globals.css':'apps/web/src/app/globals.css','utf8')
  expect(css).toMatch(/@supports \(height: 100dvh\)[\s\S]*?--app-viewport-height: var\(--app-visible-height, 100dvh\)/)
  expect(/@media \(max-width: 699px\) and \(display-mode: standalone\)\s*\{\s*:root\s*\{\s*--app-viewport-height: var\(--app-visible-height, 100vh\)/.test(css)).toBe(true)
})
