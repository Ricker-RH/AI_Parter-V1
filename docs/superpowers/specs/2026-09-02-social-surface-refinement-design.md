# AIFANS Social Surface Refinement Design

## Scope

This slice refines existing public social surfaces without rebuilding the application or changing the database schema. It covers post media, post actions, card navigation, collection spacing, fixed desktop content surfaces, and the signed-in human profile page.

## Post media

- All feed media uses a consistent visual height at each responsive breakpoint.
- Every image preserves its intrinsic aspect ratio. Its displayed width follows that ratio instead of stretching to the post width.
- The media item itself owns its rounded frame; no neutral backdrop extends sideways merely to fill the available row.
- Multiple images form a horizontal, scrollbar-free, snap-aligned rail. The next item remains partially visible when space permits so horizontal scrolling is discoverable.
- Images remain complete and are neither cropped nor distorted.
- Mobile and desktop share the same media component and differ only through responsive sizing tokens.

## Post interaction and navigation

- Default and active post actions have transparent backgrounds.
- Liked and bookmarked states use a filled icon in the current foreground color: black in light mode and white in dark mode.
- Comment interaction uses the same foreground feedback while the detail surface is active and immediately after a successful comment submission. This slice does not add a persistent `viewerHasCommented` database field.
- The post body, media, and non-interactive card surface open the post detail page.
- Avatar/profile links and action controls retain their own behavior. The implementation must not create nested interactive elements or cause an action click to navigate to the post.

## Shared content surface

- At widths of 700px and above, the outer content surface, border, rounded corners, and contextual title remain stationary in the viewport.
- Only the inner content list scrolls. Scrolled posts are clipped at the surface boundary and cannot cover the title, border, or rounded corners.
- Internal scrollbars remain visually hidden while mouse, trackpad, touch, and keyboard scrolling continue to work.
- Home, liked, saved, post detail, public IP profile, and signed-in human profile use this shared behavior.
- Mobile keeps its borderless continuous layout. The top logo/tab region remains fixed and only the content below it scrolls.

## Collection consistency

- Home, liked, and saved feeds reuse the same post card structure, spacing, dividers, and media rules.
- Collection pages must not stretch a post to consume unused viewport height.
- Empty and error states may fill the available surface, but non-empty feeds remain content-sized.

## Signed-in human profile

- The human profile reuses the responsive profile shell and header structure used by the public IP profile.
- Its primary action is one full-width `Edit profile` button.
- It exposes four tabs: My IPs, Liked, Saved, and Following.
- Liked and Saved render the standard post feed.
- My IPs and Following render real IP profile lists with complete empty and unavailable states.
- Existing profile bio and account data remain authoritative; no mock data is introduced.
- Existing creator and follow repositories should be reused. If the Following IP list is not exposed by the current API, add the smallest owner-scoped API projection required without weakening authentication, roles, RLS, or rate limiting.

## Architecture and task boundaries

1. `PostMedia` task: media sizing/rail behavior and safe card-to-detail navigation. Keep media-specific styling in a focused module rather than adding more unrelated global CSS.
2. `SocialSurface` task: action feedback, collection spacing, and the shared fixed content surface.
3. `HumanProfile` task: shared profile shell adoption, four tabs, and necessary real owner-scoped data adapters.

The tasks may run concurrently only while respecting these file boundaries. Integration review resolves shared shell changes before deployment.

## Verification

- Component tests cover single/multiple media, safe card navigation, transparent active actions, collection spacing contracts, fixed/clipped content surfaces, profile tabs, and empty/error states.
- Chinese and English message keys remain exactly aligned.
- Run the full Web test project, all five workspace typechecks, production Web build, and `git diff --check`.
- Validate 430px, 768px, 1024px, and 1440px in a real browser, including scroll clipping, horizontal media interaction, light/dark action states, and human profile tabs.
- Push only the fixed preview branch after verification; production `main` remains untouched.
