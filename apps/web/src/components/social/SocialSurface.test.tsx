import {existsSync, readFileSync} from 'node:fs'
import {render, screen, within} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {SocialSurface} from './SocialSurface.js'

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

  it('keeps the header outside one named keyboard-scroll viewport', () => {
    render(<SocialSurface className="home-page" header={<header><h1>For You</h1></header>} label="Posts"><article>Post</article></SocialSurface>)

    const surface = screen.getByRole('main')
    const viewport = within(surface).getByRole('region', {name: 'Posts'})
    expect(surface).toHaveAttribute('data-social-surface')
    expect(surface).toHaveClass('home-page')
    expect(viewport).toHaveAttribute('tabindex', '0')
    expect(viewport).toHaveAttribute('data-social-surface-viewport')
    expect(viewport).toContainElement(screen.getByText('Post'))
    expect(viewport).not.toContainElement(screen.getByRole('heading', {name: 'For You'}))
  })

  it('puts the desktop frame on the scrolling viewport while leaving the header unframed', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src/components/social' : 'apps/web/src/components/social'
    const stylesheet = readFileSync(`${root}/SocialSurface.module.css`, 'utf8')

    expect(stylesheet).toMatch(/\.surface\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*height:\s*100%/)
    expect(stylesheet).not.toMatch(/\.surface\s*\{[^}]*\bborder(?:-radius)?\s*:/)
    expect(stylesheet).toMatch(/\.viewport\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*none/)
    expect(stylesheet).toMatch(/\.viewport::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
    expect(stylesheet).toMatch(/@media \(min-width:\s*700px\)[\s\S]*?\.viewport\s*\{[^}]*background:\s*var\(--shell-surface\)[^}]*border:\s*1px solid var\(--shell-border\)[^}]*border-radius:\s*16px[^}]*overflow:\s*hidden auto/)
    expect(stylesheet).toMatch(/@media \(max-width:\s*699px\)[\s\S]*?\.viewport\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0/)
    expect(stylesheet).toMatch(/\[data-social-surface-fill\]\s*\{[^}]*min-height:\s*100%/)
  })

  it('removes the inherited page-header divider before the desktop frame', () => {
    const root = process.cwd().endsWith('/apps/web') ? 'src/components/social' : 'apps/web/src/components/social'
    const stylesheet = readFileSync(`${root}/SocialSurface.module.css`, 'utf8')

    expect(stylesheet).toMatch(/\.header\s+:global\(\.page-header\)\s*\{[^}]*border-bottom:\s*0/)
  })
})
