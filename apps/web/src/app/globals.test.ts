import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

const stylesheet = readFileSync(process.cwd().endsWith('/apps/web') ? 'src/app/globals.css' : 'apps/web/src/app/globals.css', 'utf8')

describe('ordinary-user fluid shell CSS contract', () => {
  it('keeps an icon rail from 700px to 1149px while the primary column can shrink', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) and \(max-width: 1149px\) \{[\s\S]*?\.shell\[data-shell="public"\] \{[\s\S]*?grid-template-columns: 76px minmax\(0, 1fr\)/)
  })

  it('switches only the public navigation to the full 248px rail at 1150px', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 1150px\) \{[\s\S]*?\.shell\[data-shell="public"\] \{[\s\S]*?grid-template-columns: 248px minmax\(0, 1fr\)/)
  })

  it('adds recommendations only once the full nav, 640px primary, rail and gaps fit', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 1256px\) \{[\s\S]*?\.shell\[data-shell="public"\] \{[\s\S]*?grid-template-columns: 248px minmax\(0, 640px\) 320px/)
  })

  it('keeps the messages shell compact at every desktop width', () => {
    expect(stylesheet).toMatch(/@media \(min-width: 700px\) \{[\s\S]*?\.messages-shell \{[\s\S]*?grid-template-columns: 76px minmax\(0, 1fr\)/)
  })
})
