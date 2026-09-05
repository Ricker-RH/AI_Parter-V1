# Creator portal implementation plan

**Goal:** Deliver the approved borderless mobile creator portal, responsive shared navigation, separate three-tab workspace and image generation destination without requiring artwork.

**Architecture:** Keep existing authenticated creator APIs and draft editor. Add `/creator/studio` and `/creator/images` as static routes ahead of the existing draft ID route. The portal uses a plain media placeholder. User refinement: new IP creation is only a description input and private/public selection; actual generation, saving the new input, and activation are deferred until the creation rules are specified. Private is the default, owner-only and review-free; public requires review. Never send this new input to the legacy public workflow. Image generation uses the existing draft-based intent, displays returned candidates or explicit queued/unavailable states.

**Tech stack:** Next.js App Router, React, CSS modules, existing contracts and creator BFF.

- [x] Add shared creator header and portal with valid destination links and plain background awaiting media.
- [x] Reuse app navigation and safe area dimensions in creator shell.
- [x] Add studio route and three tabs; preserve unsaved description and visibility across tabs; retain existing drafts separately.
- [x] Add image route; select a saved draft, request generation, display real results and failures.
- [x] Verify routes, tabs, errors, shell compatibility, production build and responsive geometry.

Validation: 32 web tests passed; production build and prerender verification passed. A fixture rendering the actual portal with the actual CSS was checked at 390/900/1440 in Chromium and WebKit, with no horizontal overflow and the mobile navigation at the viewport bottom. This does not substitute for authenticated device testing. Generation provider execution and private activation were not validated or claimed. Changes are local, not deployed.

Private character activation, owner-only post/chat access and a standalone prompt-to-image provider require additional backend work. Do not simulate success. No new posting rules or deployment are included in this scaffold.
