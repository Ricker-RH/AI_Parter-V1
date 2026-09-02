import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')
const surfaceStylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/SocialSurface.module.css' : 'apps/web/src/components/social/SocialSurface.module.css', 'utf8')
const mediaStylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/PostMedia.module.css' : 'apps/web/src/components/social/PostMedia.module.css', 'utf8')

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
    expect(stylesheet).toMatch(/\.route-shell-fallback-public \{[^}]*display: contents/)
    expect(stylesheet).toMatch(/\.route-shell-fallback-loading \{[^}]*display: none/)
    expect(stylesheet).toMatch(/html\[data-route-shell="admin"\][\s\S]*?\.route-shell-fallback-public[\s\S]*?display: none/)
    expect(stylesheet).toMatch(/html\[data-route-shell="admin"\][\s\S]*?\.route-shell-fallback-loading[\s\S]*?display: contents/)
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
    expect(stylesheet).toMatch(/\.mobile-feed-tabs > \.tab \{[^}]*align-items: end[^}]*min-height: 40px[^}]*padding: 0 8px 8px/)
    expect(stylesheet).toMatch(/\.post-card \{[^}]*padding: 12px/)
    expect(stylesheet).toMatch(/\.post-action \{[^}]*min-height: 36px/)
    expect(stylesheet).toMatch(/\.mobile-nav \{[^}]*height: calc\(50px \+ env\(safe-area-inset-bottom\)\)/)
    expect(stylesheet).toMatch(/\.mobile-link span \{[^}]*clip:/)
  })

  it('uses the Home feed frame contract for liked and saved collections at every responsive boundary', () => {
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.home-page, \.collection-page, \.post-detail-page \{[^}]*height: calc\(100dvh - 56px - env\(safe-area-inset-bottom\) - 50px\)/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1183px\) \{[\s\S]*?\.home-page, \.collection-page, \.post-detail-page \{[^}]*height: 100%/)
    expect(stylesheet).toMatch(/@media \(min-width: 1184px\) \{[\s\S]*?\.home-page, \.collection-page, \.post-detail-page \{[^}]*height: 100%/)
  })

  it('uses one fixed rounded desktop surface instead of attaching frame edges to content children', () => {
    expect(surfaceStylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*?\.viewport\s*\{[^}]*border:\s*1px solid var\(--shell-border\)[^}]*border-radius:\s*16px/)
    expect(stylesheet).not.toMatch(/\.home-page > \.feed-list > :(?:first|last|only)-child/)
    expect(stylesheet).not.toMatch(/\.post-detail-content > :(?:first|last|only)-child/)
  })

  it('keeps scrolling on the shared clipped viewport with a hidden scrollbar and inset focus ring', () => {
    expect(surfaceStylesheet).toMatch(/\.viewport\s*\{[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*none/)
    expect(surfaceStylesheet).toMatch(/\.viewport::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
    expect(surfaceStylesheet).toMatch(/\.viewport:focus-visible\s*\{[^}]*outline-offset:\s*-3px/)
  })

  it('keeps the phone feed as a continuous separator-only flow without an outer frame', () => {
    const phoneBlock = stylesheet.match(/@media \(max-width: 699px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(phoneBlock).not.toMatch(/\.home-page > \.feed-list[^}]*border(?:-radius|-inline|-top)?\s*:/)
    expect(phoneBlock).not.toMatch(/\.post-detail-content[^}]*border(?:-radius|-inline|-top)?\s*:/)
    expect(stylesheet).toMatch(/\.post-card \{[^}]*border-bottom: 1px solid var\(--shell-border\)/)
  })

  it('keeps responsive intrinsic-ratio post media in its focused module', () => {
    expect(stylesheet).not.toContain('.post-media-rail')
    expect(stylesheet).not.toContain('.post-media-frame')
    expect(mediaStylesheet).toMatch(/\.rail\s*\{[^}]*--post-media-height:\s*clamp\([^}]*overflow-x:\s*auto[^}]*scroll-snap-type:\s*x mandatory/s)
    expect(mediaStylesheet).toMatch(/\.frame\s*\{[^}]*aspect-ratio:\s*var\(--post-media-ratio\)[^}]*flex:\s*0 0 auto[^}]*height:\s*var\(--post-media-height\)/s)
    expect(mediaStylesheet).toMatch(/\.image\s*\{[^}]*object-fit:\s*contain[^}]*object-position:\s*center/s)
    expect(mediaStylesheet).not.toMatch(/background(?:-color)?:/)
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
    expect(stylesheet).toMatch(/\.post-detail-page \{[^}]*height: 100%/)
    expect(surfaceStylesheet).toMatch(/\.surface\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*height:\s*100%/)
    expect(surfaceStylesheet).toMatch(/\.viewport\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('keeps 430/768/1024/1440 detail-post alignment isolated from the Home feed card layout', () => {
    expect(stylesheet).toMatch(/\.post-card--detail \.post-detail-post-header \{[^}]*display:\s*grid[^}]*grid-template-columns:\s*44px minmax\(0, 1fr\)/)
    expect(stylesheet).toMatch(/\.post-card--detail \.post-detail-post-content \{[^}]*margin-top:\s*10px[^}]*min-width:\s*0/)
    expect(stylesheet).toMatch(/\.post-layout \{[^}]*grid-template-columns:\s*44px minmax\(0, 1fr\)/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-card \{[^}]*padding:\s*12px/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1183px\) \{[\s\S]*?\.post-card \{[^}]*padding-inline:\s*24px/)
    expect(stylesheet).toMatch(/@media \(min-width: 1184px\) \{[\s\S]*?\.post-detail-page \{[^}]*height:\s*100%/)
  })

  it('docks only the detail composer at 430/768/1024/1440 with a measured content reserve and no nested scroll region', () => {
    expect(stylesheet).toMatch(/\.post-detail-content \.post-detail-composer-dock \{[^}]*bottom:\s*0[^}]*position:\s*sticky/)
    expect(stylesheet).toMatch(/\.post-detail-content \.post-detail-comments-content \{[^}]*padding-bottom:\s*var\(--post-detail-composer-reserve\)/)
    expect(stylesheet).not.toMatch(/\.post-detail-content \.post-detail-composer-dock\s*\{[^}]*overflow(?:-y)?:/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-detail-content \.post-detail-composer-dock \{[^}]*bottom:\s*0/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1183px\) \{[\s\S]*?\.post-detail-page \{[^}]*height:\s*100%/)
    expect(stylesheet).toMatch(/@media \(min-width: 1184px\) \{[\s\S]*?\.post-detail-page \{[^}]*height:\s*100%/)
  })

  it('uses a centered brand at 430px and a left-contextual post title at 768px, 1024px, and 1440px', () => {
    expect(stylesheet).toMatch(/\.post-detail-header \{[^}]*grid-template-columns:\s*44px minmax\(0, 1fr\) 44px/)
    expect(stylesheet).toMatch(/\.post-detail-back, \.post-detail-menu-trigger \{[^}]*min-height:\s*44px[^}]*width:\s*44px/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-detail-brand \{[^}]*display:\s*flex[^}]*left:\s*50%[^}]*transform:\s*translateX\(-50%\)/)
    expect(stylesheet).toMatch(/@media \(max-width: 699px\) \{[\s\S]*?\.post-detail-title \{[^}]*clip:/)
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1183px\) \{[\s\S]*?\.post-detail-title \{[^}]*justify-self:\s*start/)
    expect(stylesheet).toMatch(/@media \(min-width: 1184px\) \{[\s\S]*?\.post-detail-title \{[^}]*justify-self:\s*start/)
  })

  it('keeps the desktop left navigation free of a right frame edge', () => {
    expect(stylesheet).toMatch(/\.desktop-nav\s*\{[^}]*border-right:\s*0/)
  })
})
