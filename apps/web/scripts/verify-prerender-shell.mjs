import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'

const distDir = process.env.AIFANS_NEXT_DIST_DIR === '.next-production-e2e' ? '.next-production-e2e' : '.next'
const manifest = JSON.parse(readFileSync(`${distDir}/prerender-manifest.json`, 'utf8'))
const stylesheet = readFileSync('src/app/globals.css', 'utf8')
const nonPublicKinds = ['admin', 'auth', 'messages', 'creator']

function navRange(visible, className, route) {
  const marker = visible.indexOf(`class="${className}`)
  const start = visible.lastIndexOf('<nav', marker)
  const end = visible.indexOf('</nav>', marker)
  assert.ok(marker >= 0 && start >= 0 && end > marker, `${route} must render a visible ${className}`)
  return visible.slice(start, end + '</nav>'.length)
}

function assertPrepaintShell(html, route, expectedKind) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '')
  const resolver = scripts.find((source) => source.includes('location.pathname') && source.includes("setAttribute('data-route-shell',shell)"))
  assert.ok(resolver, `${route} must include the application prepaint resolver`)
  let selectedKind
  const documentElement = {
    lang: '',
    setAttribute(name, value) { if (name === 'data-route-shell') selectedKind = value },
  }
  runInNewContext(resolver, {document: {documentElement}, location: {pathname: route}})
  assert.equal(selectedKind, expectedKind, `${route} prepaint resolver must select ${expectedKind}`)
}

function assertNav(nav, {exact = false, hrefs, labels, primary}, route, kind) {
  assert.ok(nav.includes(`aria-label="${primary}"`), `${route} ${kind} nav must use the localized primary label`)
  if (exact) {
    const anchors = [...nav.matchAll(/<a\b[^>]*>/g)].map((match) => match[0])
    const values = (attribute) => anchors.map((anchor) => new RegExp(`${attribute}="([^"]*)"`).exec(anchor)?.[1])
    assert.deepEqual(values('href'), hrefs, `${route} ${kind} nav must include exactly the expected destinations in order`)
    assert.deepEqual(values('aria-label'), labels, `${route} ${kind} nav must include exactly the expected localized labels in order`)
    return
  }
  for (const href of hrefs) assert.ok(nav.includes(`href="${href}"`), `${route} ${kind} nav must include ${href}`)
  for (const label of labels) assert.ok(nav.includes(`aria-label="${label}"`), `${route} ${kind} nav must include the localized ${label} link`)
}

for (const locale of ['en', 'zh-CN']) {
  const route = `/${locale}`
  const entry = manifest.routes[route]
  assert.equal(entry?.renderingMode, 'PARTIALLY_STATIC', `${route} must remain partially static`)
  assert.equal(entry?.response, 'initial', `${route} must have an initial response`)
  assert.equal(entry?.compute, 'resuming', `${route} must resume dynamic content`)
  assert.ok(entry?.htmlSize > 0, `${route} must have a non-empty HTML shell`)

  const html = readFileSync(`${distDir}/server/app/${locale}.html`, 'utf8')
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'))
  assert.ok(html.includes('data-app-shell="shared-interactive"'), `${route} must render the application-owned AppShell marker`)
  assertNav(navRange(html, 'desktop-nav', route), {
    hrefs: [`/${locale}`, `/${locale}?feed=following`, `/${locale}/search`, `/${locale}/channels`, `/${locale}/messages`, `/${locale}/liked`, `/${locale}/bookmarks`, `/${locale}/profile`],
    labels: [messages.forYou, messages.following, messages.search, messages.channels, messages.messages, messages.liked, messages.bookmarks, messages.myProfile],
    primary: messages.primary,
  }, route, 'desktop')
  assertNav(navRange(html, 'mobile-nav', route), {
    exact: true,
    hrefs: [`/${locale}`, `/${locale}/channels`, `/${locale}/messages`, `/${locale}/profile`],
    labels: [messages.home, messages.channels, messages.messages, messages.myNav],
    primary: messages.primary,
  }, route, 'mobile')

  for (const [kind, artifact] of [['admin', 'admin'], ['auth', 'auth/sign-in'], ['messages', 'messages'], ['creator', 'creator']]) {
    const shellRoute = `/${locale}/${artifact}`
    const shellHtml = readFileSync(`${distDir}/server/app/${locale}/${artifact}.html`, 'utf8')
    assert.match(shellHtml, /<html[^>]*data-route-shell="public"/, `${shellRoute} must include the static public default attribute`)
    assertPrepaintShell(shellHtml, shellRoute, kind)
    assert.ok(shellHtml.includes('class="route-shell-fallback-public"'), `${shellRoute} must include the application public fallback marker`)
    assert.ok(shellHtml.includes('class="route-shell-fallback-loading"'), `${shellRoute} must include the application loading fallback marker`)
    assert.ok(shellHtml.includes('class="loading-screen"'), `${shellRoute} must include the branded full-screen loading state`)
  }
}

assert.match(stylesheet, /\.route-shell-fallback-public \{ display: contents; \}/, 'public fallback must be visible by default')
assert.match(stylesheet, /\.route-shell-fallback-loading \{ display: none; \}/, 'loading fallback must be hidden by default')
for (const kind of nonPublicKinds) {
  assert.ok(stylesheet.includes(`html[data-route-shell="${kind}"] .route-shell-fallback-public`), `${kind} must hide the public fallback`)
  assert.ok(stylesheet.includes(`html[data-route-shell="${kind}"] .route-shell-fallback-loading`), `${kind} must show the loading fallback`)
}

console.log('Verified visible localized public navigation and non-public prepaint fallbacks')
