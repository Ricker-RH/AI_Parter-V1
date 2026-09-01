import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

describe('settings appearance anchor', () => {
  it('provides the Global More appearance deep-link target', () => {
    const path = process.cwd().endsWith('/apps/web') ? 'src/app/[locale]/settings/page.tsx' : 'apps/web/src/app/[locale]/settings/page.tsx'
    expect(readFileSync(path, 'utf8')).toContain('id="appearance"')
  })
})
