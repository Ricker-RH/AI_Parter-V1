# Mobile Web viewport verification — 2026-09-06

## Scope

Shared mobile Web layout, not an iPhone-only offset. Normal browser windows use
the dynamic viewport; standalone windows use the full viewport. The shell owns
navigation space once. The keyboard bridge uses VisualViewport only while an
editable control is focused and the visible area has shrunk. Pinch zoom does not
activate keyboard sizing. System safe areas are not capped to a specific phone.

Monochrome 180/192/512 icons and 48 light/dark portrait/landscape Apple launch
images are generated from the existing vector logo. These are platform metadata,
not a separate mobile UI. Existing installed applications can retain old launch
images until their installation metadata is refreshed.

## Evidence

- iPhone 17 Pro simulator, iOS 26.4, installed localhost application: screen and
  `100vh`/`100lvh` were 874 CSS px; `100dvh`/`100svh`, innerHeight and VisualViewport
  were 812 px. Fixed inset alone also measured 812. The navbar ended at 812.
- Using the full standalone viewport removed the bottom gap in the simulator.
  No device-specific 62px compensation was added.
- `/` previously returned streamed redirect HTML with the default viewport. It
  now redirects with HTTP 307 before emitting the page document. This improves
  launch initialization but by itself did not fix the measured height difference.
- Messages allocated bottom navigation clearance in both shell and list content;
  navigation is now a shell grid row and list padding no longer duplicates it.
- Post detail composer is positioned against its bounded content frame, not an
  independently measured browser viewport.
- WebKit resolved the nested 100% social viewport to 794px inside a 770px frame.
  Grid stretch now allocates the remaining frame space without percentage height;
  attached/detached headers and inner scrolling were checked at mobile/tablet/desktop widths.
- Blur/refocus while the keyboard remains visible no longer replaces the normal
  height baseline. Tests also cover viewport offset and keyboard dismissal retaining focus.

## Verification

- `pnpm exec playwright test --config playwright.mobile.config.ts`: 27 passed.
  Chromium mobile emulation, WebKit mobile emulation, Firefox narrow-window layout.
  Browser/standalone CSS modes; 360/390/430/699 widths; simulated keyboard height
  and restoration; retained profile content; comments docking; settings gutters.
  Standalone safe areas are injected in desktop engines, not native OS emulation.
- Relevant chat/social-surface/layout/viewport unit suite: 215 passed.
- Expanded social suite: 372/374 passed. Two PostCard author-preview link/focus
  assertions also fail in a separate exported HEAD source baseline; not changed here.
- Production build, TypeScript and prerender-shell verification passed using
  `.next-production-e2e` and a local validation signing secret.
- Checked all 48 PNG dimensions and all 48 generated startup-image links in
  production HTML, plus viewport-fit=cover and the Apple touch icon.
- Global CSS suite has one pre-existing legacy avatar-dimension assertion that
  also fails against base commit c1eb939. Avatar implementation was not changed.

## Remaining boundaries

- No claim that every physical Android/iOS device or every OS version was tested.
  Native simulator screenshot capture was intermittent; full native keyboard and
  orientation acceptance still needs checking on actual devices.
- First-entry IP chat error is NOT fixed by this release. Vercel log access worked,
  but searches for current_account_unavailable and 5xx did not locate the reported
  event. Successful human-chat requests were present. A synthetic viewer-snapshot
  failure demonstrates an unavailable-state recovery limitation, not the cause of
  the user's original failure. Speculative automatic refresh changes were removed.
  Next step: correlate a new reproduction's time/route with frontend and API logs.
- Local social API configuration was absent; native UI checks used unavailable
  content states, not authenticated end-to-end chat traffic.

## Release hygiene

Only task files are included. Existing .gitignore, September 4 operations notes,
other handoffs, .DS_Store files and generated next-env.d.ts changes are excluded.
