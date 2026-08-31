import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {dirname} from 'node:path'
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

it.each([
  'assets/illustrations/welcome.png',
  'apps/web/assets/illustrations/welcome.png',
  'assets/icons/home.svg',
  'apps/web/assets/icons/home.svg',
  'assets/images/onboarding.png',
  'apps/web/assets/images/onboarding.png',
  'assets/app-icons/icon.png',
  'apps/web/assets/app-icons/icon.png',
  'assets/splash/splash.png',
  'apps/web/assets/splash/splash.png',
  'assets/favicon.png',
  'apps/web/assets/logo.svg',
  'packages/mobile/assets/default-avatar.png',
])('rejects carved-out Bluesky asset at %s', path => {
  const file = `${fixture}/${path}`
  mkdirSync(dirname(file), {recursive: true})
  writeFileSync(file, '<asset/>')

  const result = spawnSync('node', ['scripts/check-forbidden-assets.mjs', fixture])

  expect(result.status).toBe(1)
  expect(result.stderr.toString()).toContain(path)
})

it('allows separately licensed flag icons', () => {
  const path = 'apps/web/assets/icons/flags/my.svg'
  const file = `${fixture}/${path}`
  mkdirSync(dirname(file), {recursive: true})
  writeFileSync(file, '<svg/>')

  const result = spawnSync('node', ['scripts/check-forbidden-assets.mjs', fixture])

  expect(result.status).toBe(0)
  expect(result.stderr.toString()).toBe('')
})
