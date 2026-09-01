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
})
