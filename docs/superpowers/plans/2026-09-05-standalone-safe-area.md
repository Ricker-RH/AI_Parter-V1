# Standalone safe-area plan and approved design

Goal: extend profile covers and theme backgrounds into the installed iPhone app status area while keeping controls clear of system UI.

- Enable viewport-fit cover and translucent Apple status bar metadata.
- Let installed mobile shells own the top inset. Cover-backed profiles retain their existing header inset, allowing the shared measured cover to reach the top without double padding.
- Preserve the existing bottom navigation safe-area treatment.
- Add a non-interactive status-area scrim for system text contrast.
- Validate the production build and shared profile/header regression tests. Actual installed iPhone status bar rendering remains a device verification step.

The user approved this design in conversation. Ordinary desktop layout and social behavior are outside this change.
