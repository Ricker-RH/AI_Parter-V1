import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterEach, describe, expect, it} from 'vitest'

const verifier = join(dirname(fileURLToPath(import.meta.url)), '../../scripts/verify-prerender-shell.mjs')
const fixtures: string[] = []
const fixtureLabels = {primary: 'Primary', forYou: 'For you', following: 'Following', search: 'Search', channels: 'Channels', messages: 'Messages', liked: 'Liked', bookmarks: 'Bookmarks', myProfile: 'Profile', home: 'Home', myNav: 'Me', creatorCenter: 'Creator', collections: 'Collections'}

function writeFixture(root: string, path: string, contents: string) {
  const target = join(root, path)
  mkdirSync(dirname(target), {recursive: true})
  writeFileSync(target, contents)
}

function publicHtml(locale: string, labels: typeof fixtureLabels) {
  const desktopHrefs = [`/${locale}`, `/${locale}?feed=following`, `/${locale}/search`, `/${locale}/channels`, `/${locale}/messages`, `/${locale}/liked`, `/${locale}/bookmarks`, `/${locale}/profile`]
  const desktopLabels = [labels.forYou, labels.following, labels.search, labels.channels, labels.messages, labels.liked, labels.bookmarks, labels.myProfile]
  const mobileHrefs = [`/${locale}`, `/${locale}/channels`, `/${locale}/messages`, `/${locale}/profile`]
  const mobileLabels = [labels.home, labels.channels, labels.messages, labels.myNav]
  const links = (hrefs: string[], ariaLabels: string[]) => hrefs.map((href, index) => `<a href="${href}" aria-label="${ariaLabels[index]}"></a>`).join('')
  return `<div data-app-shell="shared-interactive"><nav aria-label="${labels.primary}" class="desktop-nav">${links(desktopHrefs, desktopLabels)}</nav><nav aria-label="${labels.primary}" class="mobile-nav">${links(mobileHrefs, mobileLabels)}</nav></div>`
}

const prepaintResolver = "(function(){var path=location.pathname,match=/^\\/(en|zh-CN)(?=\\/|$)(.*)$/.exec(path),locale=match?match[1]:'en',rest=match&&match[2]||'',shell=rest==='/admin'||rest.indexOf('/admin/')===0?'admin':rest==='/creator'||rest.indexOf('/creator/')===0?'creator':rest==='/messages'||rest.indexOf('/messages/')===0||rest==='/notifications'?'messages':rest==='/auth'||rest.indexOf('/auth/')===0?'auth':'public';document.documentElement.lang=locale;document.documentElement.setAttribute('data-route-shell',shell)})()"

function nonPublicHtml(resolver = prepaintResolver) {
  return `<html data-route-shell="public"><script>${resolver}</script><div class="route-shell-fallback-public"></div><div class="route-shell-fallback-loading"><div class="loading-screen"></div></div></html>`
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

  it('rejects extra legacy creator and collection links in the mobile navigation', () => {
    const root = mkdtempSync(join(tmpdir(), 'aifans-prerender-verifier-'))
    fixtures.push(root)
    createValidDist(root, '.next')
    for (const locale of ['en', 'zh-CN']) {
      const path = `.next/server/app/${locale}.html`
      const html = publicHtml(locale, fixtureLabels).replace('</nav></div>', `<a href="/${locale}/creator" aria-label="${fixtureLabels.creatorCenter}"></a><a href="/${locale}/activity" aria-label="${fixtureLabels.collections}"></a><a href="/${locale}/profile" aria-label="${fixtureLabels.myProfile}"></a></nav></div>`)
      writeFixture(root, path, html)
    }

    expect(() => execFileSync(process.execPath, [verifier], {cwd: root, encoding: 'utf8'}))
      .toThrow(/mobile nav must include exactly/)
  })

  it('rejects a resolver with swapped auth and creator mappings', () => {
    const root = mkdtempSync(join(tmpdir(), 'aifans-prerender-verifier-'))
    fixtures.push(root)
    createValidDist(root, '.next')
    const swapped = prepaintResolver
      .replace("?'creator':rest==='/messages'", "?'auth':rest==='/messages'")
      .replace("?'auth':'public'", "?'creator':'public'")
    for (const locale of ['en', 'zh-CN']) {
      for (const artifact of ['admin', 'auth/sign-in', 'messages', 'creator']) {
        writeFixture(root, `.next/server/app/${locale}/${artifact}.html`, nonPublicHtml(swapped))
      }
    }

    expect(() => execFileSync(process.execPath, [verifier], {cwd: root, encoding: 'utf8'}))
      .toThrow(/prepaint resolver must select/)
  })
})
