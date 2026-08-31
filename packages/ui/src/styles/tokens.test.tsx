import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe, expect, it} from 'vitest'

const packageRoot = process.cwd()
const tokens = readFileSync(resolve(packageRoot, 'src/styles/tokens.css'), 'utf8')
const packageManifest = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
) as {exports: Record<string, string>}

describe('design token package contract', () => {
  it('defines semantic spacing and elevation tokens', () => {
    expect(tokens).toContain('--aifans-space-1:')
    expect(tokens).toContain('--aifans-space-4:')
    expect(tokens).toContain('--aifans-elevation-1:')
    expect(tokens).toContain('--aifans-elevation-3:')
  })

  it('exports the distributable token stylesheet', () => {
    expect(packageManifest.exports['./styles/tokens.css']).toBe(
      './dist/styles/tokens.css',
    )
  })
})
