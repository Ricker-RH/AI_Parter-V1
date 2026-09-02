import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const source = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/components/social/SearchContent.tsx' : 'apps/web/src/components/social/SearchContent.tsx', 'utf8')

describe('search navigation contract', () => {
  it('uses the Next form primitive so searching keeps client navigation', () => {
    expect(source).toContain("import Form from 'next/form'")
    expect(source).toContain('<Form')
    expect(source).not.toContain('<form action=')
  })

  it('does not render a redundant visible results section heading', () => {
    expect(source).not.toContain('search-results-title')
    expect(source).not.toMatch(/<h2[^>]*>\{labels\.searchResults/)
  })
})
