# Threads-style Author Preview

## Goal

Make the post-avatar author preview match the supplied Threads reference in visual hierarchy, dismissal behavior, and modal coverage while preserving AIFANS data, authorization, and follow behavior.

## Scope

This change applies to the shared author preview opened from post avatars on feed, collection, search-result post, profile-post, and post-detail surfaces. It does not redesign full profile pages, post cards, navigation, or creator publishing.

## Overlay and Layering

The modal overlay covers the complete visual viewport with one uniform translucent scrim. It must appear above desktop navigation, selected navigation backgrounds, post navigation targets, avatars, floating widgets owned by AIFANS, mobile bars, and content frames. No application surface may remain white or visually undimmed through the scrim.

The dialog is centered in the viewport and remains above the scrim. Its stacking context must not depend on the post card or scrolling container that launched it. Rendering through a document-level portal is preferred so clipped and transformed ancestors cannot constrain the overlay.

## Dialog Layout

The desktop dialog follows the Threads reference:

- A compact card approximately 380px wide, constrained to fit narrow viewports.
- A generous corner radius and balanced internal spacing.
- The identity copy occupies the left side: display name, `@username`, biography, then follower count.
- A prominent avatar sits at the upper right and is approximately 64px square.
- There is no close/X button.
- The follow/following action spans nearly the full card width at the bottom and has a minimum 44px target height.
- Loading and error feedback stay visually subordinate without changing the card width.

On mobile, the card keeps the same information order, uses safe horizontal margins, never overflows the viewport, and retains a full-width action.

## Interaction and Accessibility

- Clicking the scrim closes the dialog.
- Clicking anywhere inside the dialog does not close it.
- `Escape` closes the dialog.
- Opening moves focus into the dialog without requiring a close button.
- Tab focus stays within the modal while it is open.
- Closing returns focus to the avatar trigger.
- The dialog has `role="dialog"`, `aria-modal="true"`, and an accessible name derived from the displayed profile.
- Follow/following state, authentication routing, pending state, failure feedback, and analytics behavior remain unchanged.

## Verification

Tests must first fail against the current implementation and then prove:

- The close button is absent.
- The overlay and dialog are mounted through a document-level portal.
- Scrim click and `Escape` close the modal, while dialog clicks do not.
- Focus enters the modal, is trapped, and returns to the triggering avatar.
- The existing follow action still changes state and surfaces failures.
- CSS assigns the overlay a viewport-fixed inset and a layer above every AIFANS shell/navigation/post layer.
- The avatar is approximately 64px and the bottom action is full-width with a minimum 44px height.
- Desktop and mobile layouts fit at 430px, 768px, 1024px, and 1440px in light and dark modes without undimmed leaks or horizontal overflow.

## Non-goals

- Adding a new API request or profile field
- Changing follow permissions or mutation semantics
- Adding a close/X button
- Copying Threads branding or adding a human post composer
- Modifying or deploying Git `main`
