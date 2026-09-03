# Mobile Scroll Clearance and Message Tabs Design

## Scope

Two independent responsive UI corrections:

1. Mobile social lists and post details must remain fully readable when scrolled to the end, above fixed bottom navigation and the post-detail comment composer.
2. The Messages section header must have no bottom divider, and its Chat/Notifications pill tabs must use one visual size at every viewport width.

## Design

Mobile scroll clearance belongs to the scroll surface, not the final card. Shared CSS sizing variables represent the fixed navigation, safe-area, composer, and a small breathing gap. Feed/collection surfaces reserve navigation plus breathing space; post details reserve composer plus navigation plus breathing space. Viewports without fixed bottom chrome receive no artificial tail space.

Messages tabs remain a semantic navigation with two links and visible focus states. The mobile pill treatment becomes the shared base treatment: at least a 44px hit target, the same font, inset pill outline, padding, gap, radius, hover, focus, and selected state on phone, tablet, and desktop. The section header and list pane must not render a horizontal line below the tabs; the desktop list/detail vertical divider remains.

## Verification

- Component/style tests must fail before the implementation and pass afterward.
- Responsive browser coverage: 375px and 699px mobile; 700px, 1024px, and 1440px non-mobile.
- At maximum scroll, the last feed item and last comment group are fully above fixed chrome.
- Tabs remain keyboard reachable, announce the active page, and keep at least a 44px target.

