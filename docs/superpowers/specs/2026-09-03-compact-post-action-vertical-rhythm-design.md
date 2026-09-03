# Compact Post Action Vertical Rhythm Design

**Date:** 2026-09-03
**Status:** Approved
**Scope:** Feed post cards and post-detail cards across supported responsive layouts.

## Problem

The four post actions are horizontally compact, but their row still appears detached from the content above and the adjacent divider or comments section below. The excess space is cumulative: the shared action container adds an 8px top margin, each action preserves a 44px interaction target, and post cards retain 16px of bottom padding on medium and large layouts. The previous action-density change addressed only horizontal spacing.

## Design

Use one shared vertical rhythm for both feed and detail variants:

- Remove the action container's external top margin. The 44px control height already supplies sufficient visual breathing room around the 20px icons.
- Preserve the 44px minimum interaction target on every viewport; do not shrink controls to achieve visual density.
- Reduce post-card bottom padding to 8px while preserving the existing top and inline padding appropriate to each breakpoint.
- Keep the feedback row in normal flow beneath the controls so errors and status messages can expand without overlap.
- Apply the rule through the shared post-card and post-action selectors, not route-specific overrides, negative margins, transforms, or absolute positioning.

This changes spacing only. Post data, media geometry, action behavior, focus behavior, labels, counts, borders, and comment layout remain unchanged.

## Responsive behavior

- Small screens retain 12px top and inline card padding, 8px bottom padding, and 44px targets.
- Medium and large screens retain 16px top and 24px inline card padding, use 8px bottom padding, and retain 44px targets.
- Feed and detail cards use the same action-to-content and action-to-divider rhythm.

## Verification

- Add stylesheet regression coverage for zero action-row top margin, 8px card bottom padding at the base and small-screen rules, and preserved 44px targets.
- Run the focused Web tests, full Web tests, workspace typecheck, production build, and `git diff --check`.
- Verify the deployed Preview visually on a feed card with media, a text-only feed card, and the corresponding detail page at phone and desktop widths.
