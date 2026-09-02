import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')

describe('ordinary-user fluid shell CSS contract', () => {
  it('anchors the compact rail while the primary column chooses its own fluid start', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1149px\) \{[\s\S]*?\.shell\[data-shell="public"\] \.content \{[\s\S]*?margin-left: max\(100px, calc\(\(100vw - 640px\) \/ 2\)\)/)
  })

  it('switches only the public navigation clearance to the full 248px rail at 1150px', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 1150px\) \{[\s\S]*?\.shell\[data-shell="public"\] \.content \{[\s\S]*?margin-left: max\(272px, calc\(\(100vw - 640px\) \/ 2\)\)/)
  })

  it('adds recommendations at 1328px without making them a primary-layout column', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 1328px\) \{[\s\S]*?\.shell\[data-shell="public"\] \.right-rail \{[\s\S]*?position: absolute/)
  })

  it('keeps the messages shell compact at every desktop width', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) \{[\s\S]*?\.messages-shell \{[\s\S]*?grid-template-columns: 76px minmax\(0, 1fr\)/)
  })

  it('scopes Threads-like search and header density to the public shell', () => {
    expect(stylesheet).toMatch(/\.search-form-field \{[^}]*display: flex[^}]*min-height: 46px/)
    expect(stylesheet).toMatch(/\.shell\[data-shell="public"\] \.page-header \{[^}]*min-height: 60px/)
    expect(stylesheet).toMatch(/\.shell\[data-shell="public"\] \.page-title \{[^}]*font-size: 19px/)
  })

  it('keeps public mobile controls at least 44px and styles route recovery actions', () => {
    expect(stylesheet).toMatch(/\.post-actions button,\s*\.comment-composer button,\s*\.profile-follow button,\s*\.notification-read,\s*\.search-form button \{[^}]*min-height: 44px/)
    expect(stylesheet).toMatch(/\.route-error \{[^}]*border: 1px solid var\(--shell-border\)/)
    expect(stylesheet).toMatch(/\.route-error-actions a, \.route-error-actions button, \.unavailable-retry \{[^}]*border-radius: 999px/)
  })

  it('uses the compact mobile Home hierarchy with two equal-width feed tabs', () => {
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-header \{[^}]*display: block/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-title \{[^}]*clip:/)
    expect(stylesheet).toMatch(/\.mobile-feed-tabs > \.tab \{[^}]*flex: 1[^}]*width: 50%/)
    expect(stylesheet).not.toContain('.mobile-feed-menu')
    expect(stylesheet).toMatch(/\.mobile-top-bar \{[^}]*height: 56px/)
    expect(stylesheet).toMatch(/\.mobile-feed-tabs > \.tab \{[^}]*min-height: 44px/)
    expect(stylesheet).toMatch(/\.post-card \{[^}]*padding: 12px/)
    expect(stylesheet).toMatch(/\.post-action \{[^}]*min-height: 36px/)
    expect(stylesheet).toMatch(/\.mobile-nav \{[^}]*height: calc\(50px \+ env\(safe-area-inset-bottom\)\)/)
    expect(stylesheet).toMatch(/\.mobile-link span \{[^}]*clip:/)
  })

  it('constrains one image and makes multi-image posts a snap-scrolling rail without page overflow', () => {
    expect(stylesheet).toMatch(/\.post-media-rail \{[^}]*max-width: 100%[^}]*overflow-x: auto[^}]*scroll-snap-type: x mandatory/)
    expect(stylesheet).toMatch(/\.post-media-rail\[data-layout="single"\] \{[^}]*overflow: hidden/)
    expect(stylesheet).toMatch(/\.post-media-rail\[data-layout="rail"\] \.post-media-frame \{[^}]*flex: 0 0 min\(82%, 440px\)[^}]*scroll-snap-align: start/)
    expect(stylesheet).toMatch(/\.post-media-frame \{[^}]*max-height: 560px/)
    expect(stylesheet).toMatch(/\.post-media-frame \{[^}]*background: var\(--shell-hover\)/)
    expect(stylesheet).not.toContain('background: #f4f4f4')
  })

  it('lets long post author names shrink while keeping time and account metadata visible', () => {
    expect(stylesheet).toMatch(/\.post-author-line > a \{[^}]*min-width: 0[^}]*overflow: hidden[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/)
    expect(stylesheet).toMatch(/\.post-author-line > time, \.post-author-line > \.account-kind \{[^}]*flex: 0 0 auto/)
  })

  it('gives search profile results their own compact row instead of a post-card layout', () => {
    expect(stylesheet).toMatch(/\.profile-result \{[^}]*display: grid[^}]*grid-template-columns: 44px minmax\(0, 1fr\)/)
    expect(stylesheet).toMatch(/\.profile-result-avatar \{[^}]*height: 44px[^}]*width: 44px/)
  })
})
