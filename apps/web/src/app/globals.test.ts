import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')

describe('ordinary-user fluid shell CSS contract', () => {
  it('anchors the compact rail while the primary column chooses its own fluid start', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1183px\) \{[\s\S]*?\.shell\[data-shell="public"\] \.content \{[\s\S]*?margin-left: max\(100px, calc\(\(100% - 640px\) \/ 2\)\)/)
  })

  it('switches only after the centered public column clears the full 248px rail at 1184px', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 1184px\) \{[\s\S]*?\.shell\[data-shell="public"\] \.content \{[\s\S]*?margin-left: max\(272px, calc\(\(100% - 640px\) \/ 2\)\)/)
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
    expect(stylesheet).toMatch(/\.route-error-actions a, \.route-error-actions button, \.unavailable-retry \{[^}]*min-height: 44px/)
  })

  it('uses a full-screen branded entry state with restrained reduced-motion-safe movement', () => {
    expect(stylesheet).toMatch(/\.loading-screen \{[^}]*min-height: 100dvh/)
    expect(stylesheet).toMatch(/\.loading-screen-mark \{[^}]*width: clamp\(112px, 24vw, 176px\)[^}]*animation: loading-mark-enter 240ms/)
    expect(stylesheet).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.loading-screen-mark[^}]*animation: none/)
  })

  it('keeps every route skeleton and not-found recovery usable across mobile widths', () => {
    expect(stylesheet).toMatch(/\.route-skeleton \{[^}]*max-width: 100%[^}]*overflow: hidden/)
    expect(stylesheet).toMatch(/\.route-not-found a \{[^}]*min-height: 44px/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.route-skeleton--messages \.route-skeleton-message-detail \{[^}]*display: none/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.route-skeleton-message-detail-frame \.route-skeleton-conversation-list \{[^}]*display: none/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.route-skeleton-message-detail-frame \{[^}]*grid-template-columns: minmax\(0, 1fr\)/)
  })

  it('uses the compact mobile Home hierarchy with two equal-width feed tabs', () => {
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-header \{[^}]*display: block/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-title \{[^}]*clip:/)
    expect(stylesheet).toMatch(/\.mobile-feed-tabs > \.tab \{[^}]*flex: 1[^}]*width: 50%/)
    expect(stylesheet).not.toContain('.mobile-feed-menu')
    expect(stylesheet).toMatch(/\.mobile-top-bar \{[^}]*height: 56px/)
    expect(stylesheet).toMatch(/\.mobile-feed-tabs > \.tab \{[^}]*align-items: end[^}]*min-height: 40px[^}]*padding: 0 8px 3px/)
    expect(stylesheet).toMatch(/\.post-card \{[^}]*padding: 12px/)
    expect(stylesheet).toMatch(/\.post-action \{[^}]*min-height: 36px/)
    expect(stylesheet).toMatch(/\.mobile-nav \{[^}]*height: calc\(50px \+ env\(safe-area-inset-bottom\)\)/)
    expect(stylesheet).toMatch(/\.mobile-link span \{[^}]*clip:/)
  })

  it('uses the Home feed frame contract for liked and saved collections at every responsive boundary', () => {
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-page, \.collection-page \{[^}]*grid-template-rows: auto minmax\(0, 1fr\)[^}]*height: calc\(100dvh - 56px - env\(safe-area-inset-bottom\) - 50px\)[^}]*overflow: hidden/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-page > \.feed-list, \.collection-page > \.feed-list, \.collection-page > \.empty \{[^}]*overflow-y: auto/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1183px\) \{[\s\S]*?\.home-page, \.collection-page \{[^}]*height: 100%[^}]*overflow: hidden/)
    expect(stylesheet).toMatch(/@media \(min-width: 1184px\) \{[\s\S]*?\.home-page > \.feed-list, \.collection-page > \.feed-list, \.collection-page > \.empty \{[^}]*overflow-y: auto/)
  })

  it('keeps non-phone titles outside a rounded scrolling content frame shared by feeds and post detail', () => {
    const desktopContentRules = [...stylesheet.matchAll(/\.shell\[data-shell="public"\] \.content \{([^}]*)\}/g)]
      .map((match) => match[1] ?? '')
      .filter((declarations) => declarations.includes('height: calc(100dvh - 32px)'))
    expect(desktopContentRules).toHaveLength(2)
    expect(desktopContentRules.every((declarations) => !declarations.includes('border:'))).toBe(true)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) \{[\s\S]*?\.shell\[data-shell="public"\] \.page-header \{[^}]*border-bottom: 0/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) \{[\s\S]*?\.home-page > \.feed-list > :first-child,[\s\S]*?\.post-detail-content > :first-child \{[^}]*border-top: 1px solid var\(--shell-border\)[^}]*border-radius: 16px 16px 0 0/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) \{[\s\S]*?\.home-page > \.feed-list > \*,[\s\S]*?\.post-detail-content > \* \{[^}]*border-inline: 1px solid var\(--shell-border\)/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) \{[\s\S]*?\.home-page > \.empty,[\s\S]*?\.post-detail-content > \.empty \{[^}]*border: 1px solid var\(--shell-border\)[^}]*border-radius: 16px/)
  })

  it('moves the non-empty frame closing edge to the true end of its scrollable content', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) \{[\s\S]*?\.home-page > \.feed-list > :last-child,[\s\S]*?\.collection-page > \.feed-list > :last-child,[\s\S]*?\.post-detail-content > :last-child \{[^}]*border-bottom: 1px solid var\(--shell-border\)[^}]*border-radius: 0 0 16px 16px/)
    expect(stylesheet).not.toMatch(/(?:^|\n)\s*\.feed-list > :last-child,/)
  })

  it('keeps a single post and every post-detail empty state rounded on all four corners', () => {
    const lastChildRule = stylesheet.indexOf('.home-page > .feed-list > :last-child')
    const onlyChildRule = stylesheet.indexOf('.home-page > .feed-list > :only-child')
    expect(lastChildRule).toBeGreaterThan(-1)
    expect(onlyChildRule).toBeGreaterThan(lastChildRule)
    expect(stylesheet).toMatch(/\.home-page > \.feed-list > :only-child,[\s\S]*?\.collection-page > \.feed-list > :only-child,[\s\S]*?\.post-detail-content > :only-child \{[^}]*border-radius: 16px/)
    expect(stylesheet).toMatch(/\.post-detail-content > \.empty \{[^}]*border: 1px solid var\(--shell-border\)[^}]*border-radius: 16px/)
  })

  it('uses an inset focus ring that cannot be clipped by the public content viewport', () => {
    expect(stylesheet).toMatch(/\.feed-list:focus-visible,[\s\S]*?\.post-detail-content:focus-visible \{[^}]*outline: 2px solid[^}]*outline-offset: -3px/)
  })

  it('keeps the phone feed as a continuous separator-only flow without an outer frame', () => {
    const phoneBlock = stylesheet.match(/@media \(max-width: 699px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(phoneBlock).not.toMatch(/\.home-page > \.feed-list[^}]*border(?:-radius|-inline|-top)?\s*:/)
    expect(phoneBlock).not.toMatch(/\.post-detail-content[^}]*border(?:-radius|-inline|-top)?\s*:/)
    expect(stylesheet).toMatch(/\.post-card \{[^}]*border-bottom: 1px solid var\(--shell-border\)/)
  })

  it('hides vertical scrollbars without disabling internal scrolling at any public breakpoint', () => {
    const hiddenScrollbarRule = stylesheet.match(/\.home-page > \.feed-list,[\s\S]*?\.collection-page > \.empty,[\s\S]*?\.post-detail-content \{([^}]*)\}/)?.[1] ?? ''
    expect(hiddenScrollbarRule).toContain('scrollbar-width: none')
    expect(hiddenScrollbarRule).toContain('-ms-overflow-style: none')
    expect(hiddenScrollbarRule).toContain('overflow-y: auto')
    expect(stylesheet).toMatch(/\.home-page > \.feed-list::-webkit-scrollbar,[\s\S]*?\.post-detail-content::-webkit-scrollbar \{[^}]*display: none/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-page > \.feed-list, \.collection-page > \.feed-list, \.collection-page > \.empty \{[^}]*overflow-y: auto/)
    expect(stylesheet).toMatch(/\.post-detail-content \{[^}]*overflow-y: auto/)
  })

  it('scales every image into a 260px viewport without cropping or distortion', () => {
    expect(stylesheet).toMatch(/\.post-media-rail \{[^}]*max-width: 100%[^}]*overflow-x: auto[^}]*scroll-snap-type: x mandatory/)
    expect(stylesheet).toMatch(/\.post-media-rail\[data-layout="single"\] \{[^}]*overflow: hidden/)
    expect(stylesheet).toMatch(/\.post-media-rail\[data-layout="rail"\] \.post-media-frame \{[^}]*flex: 0 0 min\(82%, 440px\)[^}]*scroll-snap-align: start/)
    expect(stylesheet).toMatch(/\.post-media-frame \{[^}]*height: 260px/)
    expect(stylesheet).toMatch(/\.post-media-frame \{[^}]*background: var\(--shell-hover\)/)
    expect(stylesheet).toMatch(/\.post-media-rail img \{[^}]*width: 100%[^}]*height: 100%[^}]*object-fit: contain[^}]*object-position: center/)
    expect(stylesheet).not.toMatch(/\.post-media-rail img \{[^}]*object-fit: cover/)
    expect(stylesheet).not.toContain('background: #f4f4f4')
  })

  it('lets long post author names shrink while keeping the time visible', () => {
    expect(stylesheet).toMatch(/\.post-author-line > a \{[^}]*min-width: 0[^}]*overflow: hidden[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/)
    expect(stylesheet).toMatch(/\.post-author-line > time \{[^}]*flex: 0 0 auto/)
  })

  it('uses a larger content avatar without retaining the obsolete plus overlay', () => {
    expect(stylesheet).toMatch(/\.post-layout \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\)/)
    expect(stylesheet).toMatch(/\.post-avatar-trigger \{[^}]*height: 52px[^}]*width: 52px/)
    expect(stylesheet).toMatch(/\.post-avatar-trigger \.avatar \{[^}]*height: 44px[^}]*width: 44px/)
    expect(stylesheet).not.toContain('.profile-follow--avatar')
  })

  it('keeps 430/699/700/1184 comment layouts on a non-overlapping 44px identity column', () => {
    expect(stylesheet).toMatch(/\.comment-thread-item \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\)/)
    expect(stylesheet).toMatch(/\.comment-avatar \{[^}]*height: 44px[^}]*width: 44px/)
    expect(stylesheet).toMatch(/\.comment-avatar-trigger \{[^}]*height: 52px[^}]*width: 52px/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.comment-thread-item \{[^}]*padding-inline: 12px/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1183px\)/)
    expect(stylesheet).toMatch(/@media \(min-width: 1184px\)/)
  })

  it('gives search profile results their own compact row instead of a post-card layout', () => {
    expect(stylesheet).toMatch(/\.profile-result \{[^}]*display: grid[^}]*grid-template-columns: 44px minmax\(0, 1fr\)/)
    expect(stylesheet).toMatch(/\.profile-result-avatar \{[^}]*height: 44px[^}]*width: 44px/)
    expect(stylesheet).toMatch(/\.search-category-tabs \.tabs \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.search-category-tabs \{[^}]*display: block/)
    expect(stylesheet).toMatch(/\.search-results \{[^}]*min-width: 0/)
  })

  it('uses a single separator between a detail post and its comments', () => {
    expect(stylesheet).toMatch(/\.comments-section \{[^}]*border-top: 0/)
  })

  it('makes post detail one bounded scroll region beneath opaque fixed chrome', () => {
    expect(stylesheet).toMatch(/\.post-detail-page \{[^}]*display: grid[^}]*grid-template-rows: auto minmax\(0, 1fr\)[^}]*height: 100%[^}]*overflow: hidden/)
    expect(stylesheet).toMatch(/\.post-detail-content \{[^}]*min-height: 0[^}]*overflow-y: auto[^}]*overscroll-behavior: contain/)
    expect(stylesheet).toMatch(/\.post-detail-header \{[^}]*background: var\(--shell-surface\)[^}]*position: sticky/)
  })
})
