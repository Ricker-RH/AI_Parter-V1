import {readFileSync} from 'node:fs'
import {render, screen, within} from '@testing-library/react'
import type {FormHTMLAttributes, ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'
import type {SocialLabels} from './types.js'
import {SearchContent} from './SearchContent.js'

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()})}))
vi.mock('next/form', () => ({default: ({children, ...props}: FormHTMLAttributes<HTMLFormElement> & {children: ReactNode}) => <form {...props}>{children}</form>}))

const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/SearchContent.tsx' : 'apps/web/src/components/social/SearchContent.tsx', 'utf8')
const composer = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/SearchComposer.tsx' : 'apps/web/src/components/social/SearchComposer.tsx', 'utf8')

describe('search navigation contract', () => {
  it('uses the Next form primitive so searching keeps client navigation', () => {
    expect(composer).toContain("import Form from 'next/form'")
    expect(composer).toContain('<Form')
    expect(composer).not.toContain('<form action=')
  })

  it('does not render a redundant visible results section heading', () => {
    expect(source).not.toContain('search-results-title')
    expect(source).not.toMatch(/<h2[^>]*>\{labels\.searchResults/)
  })

  it('keeps Search header and results inside the attached desktop boundary', () => {
    const labels = {homeEmptyDescription: 'Empty', search: 'Search', searchInput: 'Search', searchRecommended: 'Recommended', searchSubmit: 'Search', searchSuggestions: 'Suggestions'} as SocialLabels
    render(<SearchContent category="all" labels={labels} locale="en"/>)

    const surface = screen.getByRole('main')
    const frame = surface.querySelector('[data-social-surface-frame]')
    expect(surface).toHaveAttribute('data-social-surface-frame-mode', 'attached')
    expect(surface.children).toHaveLength(1)
    expect(frame).toContainElement(screen.getByRole('heading', {name: 'Search'}))
    expect(frame).toContainElement(within(frame as HTMLElement).getByRole('region', {name: 'Recommended'}))
  })

  it('uses the compact recommendation identity layout without a feed-derived follower count', () => {
    expect(source).toContain('<ProfileResult {...(action ? {action} : {})} compact href=')
    expect(source).not.toContain('profile.followerCount')
    expect(source).not.toContain('ProfileFollowerCount')
  })
})
