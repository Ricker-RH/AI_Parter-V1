# Profile refinement follow-up

> Approved in conversation. Execute the three disjoint tracks concurrently as explicitly requested; reuse existing implementation. Parent integrates and verifies.

**Goal:** Consistent compact profile editor, live human avatars, safe unused-image cleanup.

**Architecture:** Existing profile upload/save/provider remain authoritative. UI follows existing secondary-page shell. Human avatars are live profile projections. Cleanup is bounded, authenticated and reference-aware.

## Approved UI amendment (supersedes original visual spec)

Background sits behind profile identity/bio/edit action, not above it. Editor has one frame below its header, compact avatar/background/name/username/bio rows, progressive editing. Desktop title left beside back; mobile centered. Hide mobile top/bottom primary navigation. No focus sliders, locale editor, extra Cancel, oversized previews or individual field cards. Preset colors/custom uploads remain. Preserve save/version/race/dirty-discard semantics. Do not add tags, visibility, IP asset redesign, or new public-human profile pages.

## Work ownership

- [ ] UI agent: profile components, edit route, shell classification/styles/tests, necessary translations. Add failing interaction/layout tests; refactor only presentation; run focused web tests.
- [ ] Identity agent: social human contract, live DB comment/notification projections and mappings, HumanAvatar, comment/notification UI/tests. New migration `202609040003_human_avatar_projection.sql`; deployed migrations immutable. Test historical reads, create response and current-account overrides.
- [ ] Cleanup agent: new `202609040004_profile_asset_cleanup.sql`, narrow DB repository, authenticated API worker/route/wiring and tests. Recheck active references, grace period, retries and concurrency. Do not add a production cron for a Preview-only release.
- [ ] Parent: inspect each diff against requirements then quality, run integrated tests/typecheck/build and DB tests; apply forward migrations to Preview; deploy only existing Preview branch; verify responsive UI, upload/save and historical avatar behavior online. Record actual scheduler activation status separately.

## Evidence baseline

Before edits: `pnpm test` exited 0; 173 files/1563 tests passed, 10 files/152 tests skipped. Existing linked worktree on `codex/ux-slice-0-1`; no new branch/worktree needed. Preserve unrelated untracked files.
