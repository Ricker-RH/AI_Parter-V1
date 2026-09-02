import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const distDir = process.env.AIFANS_NEXT_DIST_DIR === '.next-production-e2e' ? '.next-production-e2e' : '.next'
const manifest = JSON.parse(readFileSync(`${distDir}/prerender-manifest.json`, 'utf8'))
const stylesheet = readFileSync('src/app/globals.css', 'utf8')
const nonPublicKinds = ['admin', 'auth', 'messages', 'creator']

function visibleHtml(html, route, requireResume = false) {
  const hiddenResume = html.indexOf('<div hidden id="S:')
  if (requireResume) assert.ok(hiddenResume >= 0, `${route} must retain a resume boundary for dynamic content`)
  return hiddenResume >= 0 ? html.slice(0, hiddenResume) : html
}

function navRange(visible, className, route) {
  const marker = visible.indexOf(`class="${className}`)
  const start = visible.lastIndexOf('<nav', marker)
  const end = visible.indexOf('</nav>', marker)
  assert.ok(marker >= 0 && start >= 0 && end > marker, `${route} must render a visible ${className}`)
  return visible.slice(start, end + '</nav>'.length)
}

function assertNav(nav, {hrefs, labels, primary}, route, kind) {
  assert.ok(nav.includes(`aria-label="${primary}"`), `${route} ${kind} nav must use the localized primary label`)
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
  const visible = visibleHtml(html, route, true)
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'))
  assert.ok(visible.includes('data-app-shell="shared-interactive"'), `${route} must render AppShell in the visible static shell`)
  assertNav(navRange(visible, 'desktop-nav', route), {
    hrefs: [`/${locale}`, `/${locale}?feed=following`, `/${locale}/search`, `/${locale}/messages`, `/${locale}/liked`, `/${locale}/bookmarks`, `/${locale}/profile`],
    labels: [messages.forYou, messages.following, messages.search, messages.messages, messages.liked, messages.bookmarks, messages.myProfile],
    primary: messages.primary,
  }, route, 'desktop')
  assertNav(navRange(visible, 'mobile-nav', route), {
    hrefs: [`/${locale}`, `/${locale}/messages`, `/${locale}/creator`, `/${locale}/activity`, `/${locale}/profile`],
    labels: [messages.home, messages.messages, messages.creatorCenter, messages.collections, messages.myProfile],
    primary: messages.primary,
  }, route, 'mobile')

  for (const [kind, artifact] of [['admin', 'admin'], ['auth', 'auth/sign-in'], ['messages', 'messages'], ['creator', 'creator']]) {
    const shellRoute = `/${locale}/${artifact}`
    const shellHtml = readFileSync(`${distDir}/server/app/${locale}/${artifact}.html`, 'utf8')
    const shellVisible = visibleHtml(shellHtml, shellRoute)
    assert.ok(shellHtml.includes('data-route-shell="public"'), `${shellRoute} must include the static public default attribute`)
    assert.ok(shellHtml.includes("setAttribute('data-route-shell',shell)"), `${shellRoute} must set the prepaint route shell`)
    assert.ok(shellHtml.includes(`'${kind}'`), `${shellRoute} prepaint script must include the ${kind} whitelist branch`)
    assert.ok(shellVisible.includes('class="route-shell-fallback-public"'), `${shellRoute} must include the public fallback branch`)
    assert.ok(shellVisible.includes('class="route-shell-fallback-loading"'), `${shellRoute} must include the loading fallback branch`)
    assert.ok(shellVisible.includes('class="loading-screen"'), `${shellRoute} must include the branded full-screen loading state`)
  }
}

assert.match(stylesheet, /\.route-shell-fallback-public \{ display: contents; \}/, 'public fallback must be visible by default')
assert.match(stylesheet, /\.route-shell-fallback-loading \{ display: none; \}/, 'loading fallback must be hidden by default')
for (const kind of nonPublicKinds) {
  assert.ok(stylesheet.includes(`html[data-route-shell="${kind}"] .route-shell-fallback-public`), `${kind} must hide the public fallback`)
  assert.ok(stylesheet.includes(`html[data-route-shell="${kind}"] .route-shell-fallback-loading`), `${kind} must show the loading fallback`)
}

console.log('Verified visible localized public navigation and non-public prepaint fallbacks')
