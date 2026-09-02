import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

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

  it('uses the compact recommendation identity layout without a feed-derived follower count', () => {
    expect(source).toContain('<ProfileResult {...(action ? {action} : {})} compact href=')
    expect(source).not.toContain('profile.followerCount')
    expect(source).not.toContain('ProfileFollowerCount')
  })
})
