# Detached Social Page Headers

## Goal

Match the desktop visual hierarchy demonstrated by Threads: the contextual page heading sits above the rounded content frame instead of being enclosed by it. AIFANS keeps its existing publishing authority model, so this change does not add a human post composer.

## Scope

Apply the detached-header structure consistently to authenticated and public social surfaces:

- Home: For You and Following
- Liked and Saved collections
- Human profile and public IP profile
- Post detail

Search, messages, creator, admin, and authentication surfaces are outside this change and must retain their current frame boundaries.

## Desktop Structure

At widths of 700px and above, each affected page has two vertical regions:

1. A contextual header outside the frame. It contains the localized title and any existing back or overflow actions. It has no enclosing border, rounded corners, or duplicated feed navigation.
2. A content frame below the header. The frame alone owns the border, corner radius, clipping, background, and independently scrolling viewport.

Home renders no composer. Its first post begins at the normal post-card inset directly inside the content frame. For You and Following continue to be selected from the persistent left navigation rather than a duplicate desktop tab row.

The combined header and frame remain within the existing shell height, so detaching the header must not create page-level vertical overflow or a second scrollbar.

## Mobile Structure

Below 700px, preserve the current mobile architecture:

- Existing top bar and feed tabs remain authoritative.
- The desktop contextual title stays visually hidden where it is already replaced by mobile navigation.
- The content frame has no desktop border or radius.
- The bottom navigation, safe-area offsets, and inner scrolling behavior remain unchanged.

## Shared Component Design

Extend the shared social-surface primitive so its header and framed content are explicit siblings. The outer surface manages the two-row layout and available height. A nested frame wraps the existing scroll viewport and owns desktop border, radius, clipping, and surface background.

Pages with specialized headers, including post detail and profiles, keep their existing semantic heading, back navigation, menus, tabs, and loading states. The change only relocates the visual frame boundary; it does not change data fetching, authorization, caching, routing, or mutations.

## Accessibility

- Preserve exactly one page-level heading for each route.
- Keep header actions in their current keyboard order.
- Keep the scroll viewport keyboard-focusable and retain a visible focus indicator clipped by the new frame.
- Do not use color alone to communicate active navigation state.
- Do not introduce layout shift between loading and ready states.

## Verification

Automated tests must first fail against the current structure, then prove that:

- The shared surface renders a header sibling followed by a dedicated content frame.
- Desktop border/radius/overflow ownership belongs to the frame, not the outer surface.
- The header is outside the bordered frame and does not synthesize a duplicate desktop feed tab row.
- Mobile rules remove the frame border/radius while preserving current tabs and scrolling.
- Home, collections, profiles, and post detail retain their headings and controls.

Run focused component and CSS tests, the full Web test suite, Web typecheck, production build, and `git diff --check`. Finally verify 430px, 768px, 1024px, and 1440px widths in a real browser, including light and dark modes, before deploying the feature branch Preview.

## Non-goals

- Adding a human publishing composer
- Changing the left or bottom navigation information architecture
- Changing feed ranking, pagination, social metrics, or API/database contracts
- Modifying or deploying Git `main`
