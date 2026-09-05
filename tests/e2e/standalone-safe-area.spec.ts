import {readFileSync} from 'node:fs'
import {expect, test} from '@playwright/test'

// Desktop WebKit cannot emulate an installed iPhone's system insets. Inject
// explicit insets and activate the actual standalone stylesheet for geometry.
const css = readFileSync('apps/web/src/app/globals.css','utf8')
  .replace(/^@import[^\n]+\n/, '')
  .replaceAll('and (display-mode: standalone)', '')
  .replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g, '59px')
  .replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g, '34px')

test('retained profile content cannot pull ordinary navigation into the status area', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await page.setContent(`<html data-route-shell="public" data-profile-route="false"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="shell" data-shell="public"><div class="content"><header class="mobile-top-bar"><button>Menu</button><b>Logo</b><button>Search</button></header><main>Feed<div style="display:none"><div data-profile-background></div></div></main></div><nav class="mobile-nav"><a>Home</a></nav></div></body></html>`)
  await page.addStyleTag({content:css})
  const header=await page.locator('.mobile-top-bar').boundingBox()
  expect(header?.y).toBe(59)
  expect(header?.height).toBe(56)
  const nav=await page.locator('.mobile-nav').boundingBox()
  expect(Math.abs(nav!.y+nav!.height-844)).toBeLessThan(1)
  expect(await page.locator('.shell').evaluate(el=>getComputedStyle(el,'::after').content)).toBe('none')
  await page.locator('html').evaluate(el=>el.setAttribute('data-profile-route','true'))
  expect(await page.locator('.shell').evaluate(el=>getComputedStyle(el).paddingTop)).toBe('0px')
  await page.locator('html').evaluate(el=>el.setAttribute('data-profile-route','false'))
  expect((await page.locator('.mobile-top-bar').boundingBox())?.y).toBe(59)
})

const settingsCss=readFileSync('apps/web/src/components/settings/SettingsContent.module.css','utf8')
const preferencesCss=readFileSync('apps/web/src/components/profile/HumanPreferencesEditor.module.css','utf8').replace(/\.([a-zA-Z][\w-]*)/g,'.pref-$1')
test('settings and preference rows share gutters without card borders at all sizes', async ({page})=>{
  for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:844})
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><div class="root"><section class="group"><div class="card"><div class="row"><span class="label">个人资料</span><span class="value">头像、昵称与简介 ›</span></div></div></section><section class="pref-form"><div class="pref-row"><button class="pref-rowTrigger" role="switch" aria-checked="false"><span class="pref-rowLabel">私密主页</span><span class="pref-rowValue"></span></button><p class="pref-fieldError">其他人只能查看基本资料。</p></div></section><section class="group"><div class="card"><div class="row"><span class="label">外观主题</span><span class="value">跟随系统 ›</span></div></div></section></div>`)
    await page.addStyleTag({content:css+settingsCss+preferencesCss})
    expect((await page.locator('.label').first().boundingBox())?.x).toBe((await page.locator('.pref-rowLabel').boundingBox())?.x)
    expect(await page.locator('.pref-form').evaluate(el=>getComputedStyle(el).borderRadius)).toBe('0px')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    if(width===390) await page.screenshot({path:'/tmp/aifans-settings-layout-fixture.png'})
  }
})

test('oversized browser bottom insets do not inflate the navigation controls', async ({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><nav class="mobile-nav"><a class="mobile-link">Home</a></nav>')
  await page.addStyleTag({content:css.replace('min(34px, 34px)','min(100px, 34px)')})
  expect((await page.locator('.mobile-nav').boundingBox())?.height).toBe(84)
  expect((await page.locator('.mobile-link').boundingBox())?.height).toBe(49)
})
