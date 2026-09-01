### Task 1: Typed Web analytics and PostHog browser adapter

**Files:**
- Create: `apps/web/src/lib/analytics/contracts.ts`
- Create: `apps/web/src/lib/analytics/provider.tsx`
- Create: `apps/web/src/lib/analytics/events.ts`
- Create: `apps/web/src/lib/analytics/analytics.test.tsx`
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: real feed/chat/creator components at their existing event boundaries
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`

- [ ] Write RED tests for the exact initial event allow-list, unknown/sensitive property rejection, no-op missing configuration, provider failure isolation, profile UUID identify, logout reset, and absence of message/search/post/comment/prompt bodies.
- [ ] Run focused RED and confirm missing analytics modules.
- [ ] Implement closed event schemas and domain helpers for page/feed/profile/post/chat/creator intent events.
- [ ] Implement a lazy PostHog adapter using exact-pinned `posthog-js`, disabled autocapture, explicit page views, and no-op behavior when `NEXT_PUBLIC_POSTHOG_KEY` is absent.
- [ ] Instrument only existing real interaction boundaries; do not emit completion events from the browser.
- [ ] Run Web full tests, typecheck, production build, license scan, and diff check; commit `feat(web): add typed product analytics`.

