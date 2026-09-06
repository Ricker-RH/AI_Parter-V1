# Unified feedback implementation

Goal: consistent monochrome loading and recoverable errors across responsive application surfaces, without obscuring cached content.

1. Add shared accessible BrandLoader and FeedbackState in components/shell. Loaders have no visible prose, honor reduced motion and occupy stable space.
2. Use shared loader in initial shell, navigation feedback, route fallback, inbox authentication and profile collection loading. Delay navigation indicator by 180ms to avoid fast-route flashes.
3. Use shared failure illustration and actions in route errors and profile/inbox failures; retain short localized explanations. Retry buttons keep dimensions and accessible labels while pending.
4. Run affected Vitest suites and TypeScript, build production output, inspect responsive layout. Commit only scoped files and deploy committed snapshot to the established preview alias.

Acceptance: cached content is not replaced during background fetching; fast navigation indicator stays invisible; loading labels remain accessible but visually hidden; errors expose recovery; motion reduction supported; narrow widths do not overflow.
