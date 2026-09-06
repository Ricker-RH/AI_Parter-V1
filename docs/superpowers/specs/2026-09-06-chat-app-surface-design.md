# Chat App Surface Design

## Goal

Make the existing human conversation feel like a stable mobile/web chat surface without changing message authorization, realtime transport, or media storage APIs.

## Scope

- Keep the conversation header and composer fixed while only the message history scrolls.
- Use an arrow-only back control, peer avatar and display name. Do not expose the long account ID in the header.
- Display both participants' avatars, compact message timestamps, and sent/read state for the local participant.
- Show presence only when the realtime layer has a confirmed online signal. Absence is neutral; it is not rendered as a false “offline” claim.
- Replace the browser-native audio control with a compact voice bubble. Holding the voice control starts recording; releasing sends it, and an upward gesture cancels it. Very short or failed recordings show a clear local error.
- Keep the composer, emoji and attachment controls reachable above the keyboard. The attachment panel is a four-column mobile grid containing only available actions: image library and camera. Remove sharing.
- Make emoji insertion retain the open panel and current draft. Existing Unicode stickers remain an emoji-style option; no new sticker asset system is introduced in this pass.

## Non-goals

- No new file uploads, calls, video chat, external sticker packs, read-receipt protocol changes, or presence protocol changes.
- No changes to existing relationship permissions, message APIs, attachment storage, or realtime ticket creation.

## Data and interaction model

The existing conversation and human message models remain the sole source of peer identity, sender identity, timestamps, read cursors and attachments. The message area owns scroll position; new messages only auto-scroll when the user is already at the bottom. The header and composer remain outside that scroll area.

Voice recording continues to use the existing upload/send endpoints. On release, a valid recording is uploaded and sent immediately. Cancelling, permission denial and upload failure do not create a message. Voice playback keeps the existing renewable attachment URL behavior but exposes custom play/pause and duration UI rather than browser controls.

## Acceptance checks

- On desktop and mobile, scrolling history does not move the conversation header or composer.
- The header contains an accessible arrow-back control, peer avatar/name and optional confirmed “Online” state, without an account ID.
- Every rendered message has an avatar grouping and a readable timestamp; local messages retain sent/read status.
- A warm/cold attachment failure has an explicit retry; voice has no browser-native control bar.
- Holding then releasing voice sends once; upward cancellation sends nothing; keyboard interaction remains accessible.
- The mobile attachment sheet uses a four-column layout and exposes no share action.
- Existing human-chat unit tests and new interaction/layout regressions pass; browser tests cover desktop and mobile viewport behavior.
