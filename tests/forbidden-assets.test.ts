import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {afterEach, expect, it} from 'vitest'

const fixture = 'tests/.tmp-forbidden-assets'

afterEach(() => rmSync(fixture, {recursive: true, force: true}))

it('rejects carved-out Bluesky assets', () => {
  mkdirSync(`${fixture}/assets/icons`, {recursive: true})
  writeFileSync(`${fixture}/assets/icons/home.svg`, '<svg/>')

  const result = spawnSync('node', ['scripts/check-forbidden-assets.mjs', fixture])

  expect(result.status).toBe(1)
  expect(result.stderr.toString()).toContain('assets/icons/home.svg')
})
