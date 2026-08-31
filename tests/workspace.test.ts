import {existsSync, readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'

describe('workspace contract', () => {
  it('pins the approved runtime and package manager', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(root.packageManager).toBe('pnpm@11.21.0')
    expect(root.engines.node).toBe('>=24.19.0')
  })

  it('defines every verification command', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(Object.keys(root.scripts)).toEqual(
      expect.arrayContaining(['build', 'lint', 'typecheck', 'test']),
    )
    expect(root.scripts.test).toBe('vitest run')
  })

  it('uses a Vitest v4-compatible project configuration', () => {
    expect(existsSync('vitest.config.ts')).toBe(true)
  })
})
