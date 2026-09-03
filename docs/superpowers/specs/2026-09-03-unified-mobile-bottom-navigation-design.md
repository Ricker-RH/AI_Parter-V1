# Unified Mobile Bottom Navigation Design

## Problem

The public mobile shell renders the bottom navigation as the second row of a bounded viewport grid. This remains stable only when each route scrolls inside its assigned content row. The activity route renders an unbounded `main`, while the profile route recomputes viewport height and creates a second, conflicting grid boundary. On mobile browsers this allows route content or elastic scrolling to move the shell row containing the bottom navigation.

## Design

The public shell remains the only owner of `100dvh`, the mobile top bar, the safe-area-aware bottom-navigation row, and outer overflow clipping. Every route inside that shell must fill the assigned `minmax(0, 1fr)` content row and expose one bounded inner vertical scroll viewport.

The activity route will use the existing `SocialSurface` component in attached-header mode so its activity tabs and feed share the same bounded scrolling contract as home and collection pages. The profile route will retain its specialized profile surface, but its outer page will fill the parent track instead of recalculating `100dvh`; its single page-content child will fill the page, and `.surface` will remain the only vertical scroll owner.

The bottom navigation will not receive route-specific `fixed`, transform, margin, or padding rules. Its appearance and safe-area sizing remain unchanged.

## Verification

- Source/component tests first require the activity route to use `SocialSurface` and require profile mobile layout to inherit parent height without viewport arithmetic.
- At a phone viewport, home, activity liked/saved, and profile must keep document scrolling at zero while their named inner viewport scrolls.
- The mobile navigation rectangle must remain unchanged before and after content scrolling.
- Existing Web tests, type checking, and production build must pass before deployment.

