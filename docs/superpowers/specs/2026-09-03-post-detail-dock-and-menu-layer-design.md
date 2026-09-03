# Post Detail Dock and Menu Layer Design

**Date:** 2026-09-03

## Goal

Make the post-detail page behave like the supplied Threads reference:

- the primary comment composer is always reachable at the bottom of the detail content area;
- on mobile it sits immediately above the fixed bottom navigation and safe area;
- on desktop it sits at the bottom of the rounded detail frame;
- the post body and comments are the only vertically scrolling content;
- the top-right action menu always paints above post content without text or media leaking through it.

## Root causes

The composer is currently the final child of the comments section and uses `position: sticky`. A bottom-sticky element is constrained by its normal position; it does not pull itself from the end of a long comment list to the visible viewport on initial render. The page therefore shows a clipped or unreachable portion of the composer until the user approaches the end of the list.

The menu has a large local `z-index`, but the detached header wrapper creates a lower stacking context than descendants of the later content frame. A child cannot escape its ancestor stacking context, so post text can paint over the menu despite the menu's local number.

## Considered approaches

### 1. Larger `bottom` and `z-index` values

This would only hide the current symptoms. It remains dependent on viewport height, browser chrome, safe-area insets, soft keyboards, and future child stacking contexts. Rejected.

### 2. Portal both controls to `document.body`

Portals solve ancestor stacking contexts. They are appropriate for modal dialogs, but a persistent composer would then need continuous width and horizontal-position measurement at every breakpoint. That duplicates shell layout in JavaScript and is unnecessarily fragile. Rejected for the composer and unnecessary for this bounded menu.

### 3. Structural dock plus isolated surface layers (selected)

Turn the detail viewport into a two-row grid: one `minmax(0, 1fr)` scroll region and one intrinsic-height footer row. Move the post and comments into the scroll region and the primary composer into the footer. Establish an isolated stacking context on the shared social surface, with the header above a bounded frame stacking context. This makes placement and paint order properties of the layout rather than magic offsets.

## Component structure

### Social surface

Extend `SocialSurface` with an explicit viewport layout mode:

- `scroll` remains the default for Home, Search, collections, and other existing pages;
- `docked` makes the viewport a two-row grid and removes outer vertical scrolling.

In `docked` mode the viewport is a layout container, not the keyboard-scroll target. The child scroll region owns `overflow-y: auto`, `overscroll-behavior: contain`, hidden-scrollbar styling, `role="region"`, an accessible label, and `tabIndex={0}`. There must be exactly one active vertical scroll owner.

The shared surface establishes:

- `isolation: isolate` on the surface;
- a positioned content frame at the base layer;
- a positioned header at the layer above the frame;
- the existing menu layer above its header background.

This ordering applies to both attached and detached variants without raising the entire application above modal overlays. The author preview remains in the document portal and is unaffected.

### Post detail content

For a successful result, `PostDetailContent` renders two direct layout children:

1. a scroll region containing the post card, comments toolbar, comments, replies, empty state, and pagination;
2. the primary comment/sign-in/auth-loading dock.

The dock is no longer nested at the end of `.comments-section`, no longer sticky, and no longer needs a synthetic bottom padding reserve. Remove the `ResizeObserver`, measured composer height state, and `--post-detail-composer-reserve`; grid layout naturally allocates the current composer height, including validation/status rows and textarea growth.

Reply composers remain inline within their comment threads and scroll with the content.

For unavailable/error results, the state fills the docked viewport without rendering an empty footer.

### Detail page composition

The detail route selects `viewportLayout="docked"`. Other `SocialSurface` consumers keep the default behavior with no markup or scrolling change.

## Responsive behavior

The public shell already reserves the mobile top bar and fixed bottom navigation from `.post-detail-page` height. The dock therefore uses `bottom: auto` and normal grid placement; no duplicated `50px` navigation offset is added.

- Under 700px, the detail surface fills the shell's reserved content height; the dock touches the top border of the bottom navigation and includes its own horizontal padding.
- At 700px and above, the dock stays inside the rounded frame and the frame clips its background and borders.
- The scroll region has `min-height: 0` and `min-width: 0` so long comments, media, or narrow widths cannot force a second page scrollbar.
- Safe-area handling remains owned by the shell and mobile navigation. The composer must not add the inset a second time.
- When the textarea grows, the footer row grows upward and the scroll row shrinks; the submit button and status remain reachable.

## Menu behavior

The menu remains anchored to the existing trigger and retains its current keyboard behavior, Escape dismissal, outside-click dismissal, copy, share, and refresh actions. The change is layer containment, not interaction semantics.

The menu background must be fully opaque in light and dark themes. Post text, images, hover states, and focused descendants inside the content frame cannot paint above it because the entire frame is bounded to the lower stacking layer.

The trigger and menu remain below document-level modal portals. Opening the author preview or report modal must still cover the page.

## Accessibility

- The actual scroll region is keyboard-focusable and named; the non-scrolling grid wrapper is not presented as a misleading scroll region.
- The composer remains in normal DOM order after the content region.
- Tab order reaches content controls, then the primary composer.
- Existing menu roles, item navigation, Escape behavior, and trigger focus restoration remain unchanged.
- No fixed element covers focused content; browser scrolling keeps focused comments within the scroll region above the dock.

## Testing

### Component and CSS contracts

- `SocialSurface` default mode retains the current scroll viewport.
- Docked mode exposes a two-row viewport without outer scrolling.
- A successful post detail renders exactly one named scroll region followed by one composer dock.
- The composer dock is outside the comments list and contains the primary composer/sign-in/loading state.
- No `ResizeObserver`, height state, reserve custom property, sticky composer, or mobile bottom offset remains.
- Growing composer content is handled by grid rows rather than measured padding.
- Surface/header/frame layer tests prove that frame descendants cannot out-stack the header menu.
- Menu remains opaque and keeps its keyboard/outside-click/focus tests.
- Error states fill the available docked viewport and do not render a footer.

### Browser acceptance

At 430px, 500px, 768px, 1024px, and 1440px in both themes:

1. Open a detail page at the first comment and at the end of a long comment list.
2. Confirm the composer is fully visible directly above mobile navigation or at the desktop frame bottom.
3. Grow the textarea to multiple lines and confirm it expands upward without covering comments or navigation.
4. Scroll comments and confirm the detail header and composer stay stationary while only the content region scrolls.
5. Open the top-right menu over text and media; confirm the menu is fully opaque and no content leaks through.
6. Confirm Escape/outside click closes the menu and focus behavior remains correct.
7. Confirm there is no horizontal overflow, second vertical scrollbar, obscured focus target, or application console error.

## Non-goals

- Changing comment creation, pagination, sorting, or reply behavior.
- Adding Threads media/GIF controls to the composer.
- Changing the mobile navigation height or shell breakpoints.
- Converting the action menu into a modal dialog or document-level portal.
- Changing Home, Search, collections, or profile scrolling behavior.
