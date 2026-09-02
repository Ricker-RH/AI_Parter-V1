import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'

const verifier = join(process.cwd(), 'scripts/verify-prerender-shell.mjs')
const fixtures: string[] = []
const fixtureLabels = {primary: 'Primary', forYou: 'For you', following: 'Following', search: 'Search', messages: 'Messages', liked: 'Liked', bookmarks: 'Bookmarks', myProfile: 'Profile', home: 'Home', creatorCenter: 'Creator', collections: 'Collections'}

function writeFixture(root: string, path: string, contents: string) {
  const target = join(root, path)
  mkdirSync(dirname(target), {recursive: true})
  writeFileSync(target, contents)
}

function publicHtml(locale: string, labels: typeof fixtureLabels) {
  const desktopHrefs = [`/${locale}`, `/${locale}?feed=following`, `/${locale}/search`, `/${locale}/messages`, `/${locale}/liked`, `/${locale}/bookmarks`, `/${locale}/profile`]
  const desktopLabels = [labels.forYou, labels.following, labels.search, labels.messages, labels.liked, labels.bookmarks, labels.myProfile]
  const mobileHrefs = [`/${locale}`, `/${locale}/messages`, `/${locale}/creator`, `/${locale}/activity`, `/${locale}/profile`]
  const mobileLabels = [labels.home, labels.messages, labels.creatorCenter, labels.collections, labels.myProfile]
  const links = (hrefs: string[], ariaLabels: string[]) => hrefs.map((href, index) => `<a href="${href}" aria-label="${ariaLabels[index]}"></a>`).join('')
  return `<div data-app-shell="shared-interactive"><nav aria-label="${labels.primary}" class="desktop-nav">${links(desktopHrefs, desktopLabels)}</nav><nav aria-label="${labels.primary}" class="mobile-nav">${links(mobileHrefs, mobileLabels)}</nav></div><div hidden id="S:fixture"></div>`
}

function nonPublicHtml() {
  return `<html data-route-shell="public"><script>setAttribute('data-route-shell',shell);'admin';'auth';'messages';'creator'</script><div class="route-shell-fallback-public"></div><div class="route-shell-fallback-loading"><div class="loading-screen"></div></div></html>`
}

function createValidDist(root: string, distDir: string) {
  const routes = Object.fromEntries(['/en', '/zh-CN'].map((route) => [route, {renderingMode: 'PARTIALLY_STATIC', response: 'initial', compute: 'resuming', htmlSize: 1}]))
  writeFixture(root, `${distDir}/prerender-manifest.json`, JSON.stringify({routes}))
  for (const locale of ['en', 'zh-CN']) {
    writeFixture(root, `messages/${locale}.json`, JSON.stringify(fixtureLabels))
    writeFixture(root, `${distDir}/server/app/${locale}.html`, publicHtml(locale, fixtureLabels))
    for (const artifact of ['admin', 'auth/sign-in', 'messages', 'creator']) writeFixture(root, `${distDir}/server/app/${locale}/${artifact}.html`, nonPublicHtml())
  }
  writeFixture(root, 'src/app/globals.css', `.route-shell-fallback-public { display: contents; }\n.route-shell-fallback-loading { display: none; }\n${['admin', 'auth', 'messages', 'creator'].map((kind) => `html[data-route-shell="${kind}"] .route-shell-fallback-public {}\nhtml[data-route-shell="${kind}"] .route-shell-fallback-loading {}`).join('\n')}`)
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, {recursive: true, force: true})
})

describe('prerender shell artifact verifier', () => {
  it('reads only the production-e2e dist when the matching env value is selected', () => {
    const root = mkdtempSync(join(tmpdir(), 'aifans-prerender-verifier-'))
    fixtures.push(root)
    writeFixture(root, '.next/prerender-manifest.json', JSON.stringify({routes: {}}))
    createValidDist(root, '.next-production-e2e')

    const output = execFileSync(process.execPath, [verifier], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, AIFANS_NEXT_DIST_DIR: '.next-production-e2e'},
    })

    expect(output).toContain('Verified visible localized public navigation and non-public prepaint fallbacks')
  })
})
