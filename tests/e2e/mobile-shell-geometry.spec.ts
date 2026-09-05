import {readFileSync} from 'node:fs'
import {expect,test} from '@playwright/test'

const source=readFileSync('apps/web/src/app/globals.css','utf8').replace(/^@import[^\n]+\n/,'')
const chatCss=readFileSync('apps/web/src/components/chat/MessagesWorkspace.module.css','utf8').replace(/:global\(([^)]+)\)/g,'$1')
const surfaceCss=readFileSync('apps/web/src/components/social/SocialSurface.module.css','utf8').replace(/:global\(([^)]+)\)/g,'$1')
test('attached and detached social viewports fill only the space below their headers',async({page})=>{
  for(const width of [390,768,1440])for(const attached of [false,true]){
    await page.setViewportSize({width,height:844})
    const header='<header class="header" style="height:56px">Title</header>'
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><main class="surface" style="height:700px" data-social-surface-frame-mode="${attached?'attached':'detached'}">${attached?'':header}<div class="frame ${attached?'attachedFrame':''}">${attached?header:''}<div class="viewport"><div style="height:1500px">Content</div></div></div></main>`)
    await page.addStyleTag({content:source+surfaceCss})
    const frame=await page.locator('.frame').boundingBox(),viewport=await page.locator('.viewport').boundingBox(),title=await page.locator('.header').boundingBox()
    expect(Math.abs(viewport!.y-title!.y-title!.height)).toBeLessThanOrEqual(width>=700?1:0)
    expect(Math.abs(viewport!.y+viewport!.height-frame!.y-frame!.height)).toBeLessThanOrEqual(1)
    await page.locator('.viewport').evaluate(el=>{el.scrollTop=500})
    expect(await page.locator('.viewport').evaluate(el=>el.scrollTop)).toBe(500)
  }
})
test('post composer is anchored to the content frame, not a second browser viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await page.setContent('<html data-route-shell="public"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="shell" data-shell="public" data-mobile-top-bar="hidden"><div class="content"><main class="surface" data-social-surface-frame-mode="detached"><header class="header">Post</header><div class="frame"><div class="viewport dockedViewport"><div class="post-detail-scroll-region"><section class="comments-section"><div style="height:1500px">Comments</div><div class="post-detail-composer-dock" style="height:64px">Reply</div></section></div></div></div></main></div><nav class="mobile-nav">Navigation</nav></div></body></html>')
  await page.addStyleTag({content:source.replaceAll('and (display-mode: standalone)','')+surfaceCss})
  expect(await page.locator('.post-detail-composer-dock').evaluate(el=>getComputedStyle(el).position)).toBe('absolute')
  for(const height of [844,500]){
    await page.evaluate(h=>document.documentElement.style.setProperty('--app-visible-height',`${h}px`),height)
    await page.locator('.post-detail-scroll-region').evaluate(el=>{el.scrollTop=500})
    expect(await page.locator('.post-detail-scroll-region').evaluate(el=>el.scrollTop)).toBe(500)
    const dock=await page.locator('.post-detail-composer-dock').boundingBox(),nav=await page.locator('.mobile-nav').boundingBox()
    expect(Math.abs(dock!.y+dock!.height-nav!.y)).toBeLessThan(1)
  }
})
for(const mode of ['browser','standalone'] as const)for(const kind of ['public','messages'] as const){
  test(`${mode} ${kind}: one viewport and one navigation allocation`,async({page})=>{
    for(const width of [360,390,430,699]){
      await page.setViewportSize({width,height:844})
      await page.setContent(`<html data-route-shell="${kind}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="shell ${kind==='messages'?'messages-shell':''}" data-shell="${kind}" data-mobile-top-bar="hidden"><div class="content"><main class="workspace"><aside class="listPane">Content</aside></main></div><nav class="mobile-nav"><a>Home</a></nav></div></body></html>`)
      const css=(mode==='standalone'?source.replaceAll('and (display-mode: standalone)',''):source)
        .replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g,mode==='standalone'?'62px':'0px')
        .replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g,'34px')
      await page.addStyleTag({content:css+chatCss})
      const shell=await page.locator('.shell').boundingBox(),nav=await page.locator('.mobile-nav').boundingBox()
      expect(Math.abs(nav!.y+nav!.height-shell!.y-shell!.height)).toBeLessThan(1)
      expect(Math.abs(shell!.height-844)).toBeLessThan(1)
      const content=await page.locator('.content').boundingBox()
      expect(Math.abs(content!.y+content!.height-nav!.y)).toBeLessThan(1)
      if(kind==='messages')expect(await page.locator('.listPane').evaluate(el=>getComputedStyle(el).paddingBottom)).toBe('0px')
      await page.evaluate(()=>document.documentElement.style.setProperty('--app-visible-height','500px'))
      expect(Math.abs((await page.locator('.shell').boundingBox())!.height-500)).toBeLessThan(1)
      await page.evaluate(()=>document.documentElement.style.removeProperty('--app-visible-height'))
      expect(Math.abs((await page.locator('.shell').boundingBox())!.height-844)).toBeLessThan(1)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    }
  })
}
