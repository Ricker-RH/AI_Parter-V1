import {existsSync, readFileSync} from 'node:fs'
import {fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'
import {shouldTriggerPullRefresh, SocialSurface} from './SocialSurface.js'

describe('SocialSurface', () => {
  it('has a component and colocated responsive stylesheet', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src/components/social' : 'apps/web/src/components/social'

    expect(existsSync(`${root}/SocialSurface.tsx`)).toBe(true)
    expect(existsSync(`${root}/SocialSurface.module.css`)).toBe(true)
  })

  it('exports the shared social surface component', async () => {
    const module = await import('./SocialSurface.js')

    expect(module.SocialSurface).toBeTypeOf('function')
  })

  it('places the header before a dedicated frame containing one named keyboard-scroll viewport', () => {
    render(<SocialSurface className="home-page" header={<header><h1>For You</h1></header>} label="Posts"><article>Post</article></SocialSurface>)

    const surface = screen.getByRole('main')
    const header = screen.getByRole('heading', {name: 'For You'}).parentElement
    const frame = surface.querySelector('[data-social-surface-frame]')
    expect(header).not.toBeNull()
    expect(frame).not.toBeNull()
    const viewport = within(frame as HTMLElement).getByRole('region', {name: 'Posts'})
    expect(surface).toHaveAttribute('data-social-surface')
    expect(surface).toHaveAttribute('data-social-surface-frame-mode', 'detached')
    expect(surface).toHaveClass('home-page')
    expect(surface.firstElementChild).toContainElement(header)
    expect(surface.children[1]).toBe(frame)
    expect(frame).toContainElement(viewport)
    expect(frame).not.toContainElement(header)
    expect(viewport).toHaveAttribute('tabindex', '0')
    expect(viewport).toHaveAttribute('data-social-surface-viewport')
    expect(viewport).toContainElement(screen.getByText('Post'))
    expect(viewport).not.toContainElement(header)
  })

  it('renders a pull-refresh indicator and uses a release threshold', () => {
    render(<SocialSurface header={<header><h1>For You</h1></header>} label="Posts" onRefresh={async () => undefined}><article>Post</article></SocialSurface>)

    expect(document.querySelector('[data-pull-refresh-indicator]')).toHaveTextContent('Pull to refresh')
    expect(shouldTriggerPullRefresh(55)).toBe(false)
    expect(shouldTriggerPullRefresh(56)).toBe(true)
  })


  it('keeps an attached-mode header and viewport inside the same frame', () => {
    render(<SocialSurface frameMode="attached" header={<header className="page-header"><h1>Search</h1></header>} label="Results"><article>Result</article></SocialSurface>)

    const surface = screen.getByRole('main')
    const header = screen.getByRole('heading', {name: 'Search'}).parentElement
    const frame = surface.querySelector('[data-social-surface-frame]')
    const viewport = screen.getByRole('region', {name: 'Results'})
    expect(frame).not.toBeNull()
    expect(surface).toHaveAttribute('data-social-surface-frame-mode', 'attached')
    expect(surface.children).toHaveLength(1)
    expect(surface.firstElementChild).toBe(frame)
    expect(frame).toContainElement(header)
    expect(frame).toContainElement(viewport)
  })

  it('uses a semantic scroll viewport by default and a non-semantic two-row layout viewport when docked', () => {
    const {rerender} = render(<SocialSurface header={<header><h1>Post</h1></header>} label="Post and comments"><article>Post</article></SocialSurface>)

    const defaultViewport = document.querySelector('[data-social-surface-viewport]')
    expect(defaultViewport).toHaveAttribute('data-social-surface-viewport-layout', 'scroll')
    expect(defaultViewport).toHaveAttribute('role', 'region')
    expect(defaultViewport).toHaveAttribute('aria-label', 'Post and comments')
    expect(defaultViewport).toHaveAttribute('tabindex', '0')

    rerender(<SocialSurface header={<header><h1>Post</h1></header>} label="Post and comments" viewportLayout="docked"><article>Post</article><footer>Composer</footer></SocialSurface>)

    const dockedViewport = document.querySelector('[data-social-surface-viewport]')
    expect(dockedViewport).toHaveAttribute('data-social-surface-viewport-layout', 'docked')
    expect(dockedViewport).not.toHaveAttribute('role')
    expect(dockedViewport).not.toHaveAttribute('aria-label')
    expect(dockedViewport).not.toHaveAttribute('tabindex')
    expect(dockedViewport?.children).toHaveLength(2)
  })

  it('isolates the surface and keeps attached and detached content below the header layer', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src/components/social' : 'apps/web/src/components/social'
    const stylesheet = readFileSync(`${root}/SocialSurface.module.css`, 'utf8')

    expect(stylesheet).toMatch(/\.surface\s*\{[^}]*isolation:\s*isolate/)
    expect(stylesheet).toMatch(/\.frame\s*\{[^}]*position:\s*relative[^}]*z-index:\s*0/)
    expect(stylesheet).toMatch(/\.viewport\s*\{[^}]*position:\s*relative[^}]*z-index:\s*0/)
    expect(stylesheet).toMatch(/\.dockedViewport\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto[^}]*overflow:\s*hidden/)
  })

  it('gives the content frame sole ownership of clipping and desktop shell edges', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src/components/social' : 'apps/web/src/components/social'
    const stylesheet = readFileSync(`${root}/SocialSurface.module.css`, 'utf8')

    expect(stylesheet).toMatch(/\.surface\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*min-width:\s*0/)
    expect(stylesheet).not.toMatch(/\.surface\s*\{[^}]*(?:border(?:-radius)?|overflow):/)
    expect(stylesheet).toMatch(/\.header\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*min-width:\s*0[^}]*position:\s*relative[^}]*z-index:\s*1/)
    expect(stylesheet).toMatch(/\.frame\s*\{[^}]*min-height:\s*0[^}]*min-width:\s*0[^}]*overflow:\s*hidden/)
    expect(stylesheet).toMatch(/\.attachedFrame\s*\{[^}]*display:\s*grid[^}]*grid-row:\s*1 \/ -1[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/)
    expect(stylesheet).toMatch(/\.frame\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/)
    expect(stylesheet).toMatch(/\.viewport\s*\{[^}]*height:\s*auto[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*none/)
    expect(stylesheet).toMatch(/\.viewport::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
    expect(stylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*?\.frame\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*border:\s*1px solid var\(--shell-border\)[^}]*border-radius:\s*16px/)
    expect(stylesheet).not.toMatch(/@media \(min-width:\s*700px\)[\s\S]*?\.viewport\s*\{[^}]*\bborder(?:-radius)?\s*:/)
    expect(stylesheet).toMatch(/@media \(max-width:\s*699px\)[\s\S]*?\.frame\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0/)
    expect(stylesheet).toMatch(/\[data-social-surface-fill\]\s*\{[^}]*min-height:\s*100%/)
  })

  it('removes the desktop page-header divider only for detached surfaces', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src/components/social' : 'apps/web/src/components/social'
    const stylesheet = readFileSync(`${root}/SocialSurface.module.css`, 'utf8')
    const globalStylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')

    expect(globalStylesheet).toMatch(/\.page-header\s*\{[^}]*border-bottom:\s*1px solid var\(--shell-border\)/)
    expect(stylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*?\[data-social-surface-frame-mode="detached"\]\s+\.header\s+:global\(\.page-header\)\s*\{[^}]*border-bottom:\s*0/)
    expect(stylesheet).not.toMatch(/\[data-social-surface-frame-mode="attached"\][^{]*:global\(\.page-header\)\s*\{[^}]*border-bottom:\s*0/)
    expect(stylesheet).not.toMatch(/^\s*\.header\s+:global\(\.page-header\)\s*\{[^}]*border-bottom:\s*0/m)
  })
})
