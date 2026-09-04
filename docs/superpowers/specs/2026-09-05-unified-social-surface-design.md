# Unified Social Surface Design

## Goal
Make AIFANS mobile and desktop social surfaces behave as one coherent product: stable cached views, fixed navigation, consistent headers and rows, correct identity cues, and a safe in-product IP share flow.

## Product decisions
- Channels defines the common title/search geometry used by Messages and Notifications. Messages retains its Chat/Notifications segmented control below the search field.
- Every route owns a single scrolling viewport below fixed or sticky navigation. All app tabs use the same dynamic viewport and safe-area contract.
- Profile layouts remain type-specific, but profile header chrome is shared. Self profiles have no search button; third-party human/IP profiles use an overflow menu. Human overflow contains Block/Unblock; IP overflow contains Share.
- Profile summaries and relationship/follower data are cache-first and revalidated in the background.
- Human and IP inbox avatars have one size. IPs receive a deterministic, theme-aware animated halo; people do not receive a type label.
- Unread counts are red numeric badges on conversations and the bottom Messages tab.
- Every avatar navigates to its profile except the existing author-preview interaction in the publishing flow.
- Post and comment actions use a shared metric/spacing component.
- IP sharing uses a themed bottom sheet. It is open to guests for copying, native sharing, and share-card generation. In-app sending requires an authenticated human recipient who is mutually followed. One recipient is selected before an optional note and a clickable IP card are sent.
- Uploading image previews carry their own overlay/spinner. No separate upload-status row is rendered.

## Non-goals
- Group chat and multi-recipient share are deferred.
- Shared IP visibility does not override normal profile access policy.
- Browser refresh remains native; page controls refresh data without full reload.

## Acceptance checks
- Switching any app or content tab preserves cached content without foreground loading text.
- Mobile nav/header stays visible while content scrolls and behaves in Safari/A2HS using the same viewport rules.
- Follower counts, identity styling, unread badges and upload states appear without a manual reload.
- Share sheet handles guest actions, no-recipient state, recipient selection, note entry, sending failure, copy, native sharing, and card creation in both themes.
