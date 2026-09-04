# Profile assets Preview release — 2026-09-04

- Branch / deployed SHA: `codex/ux-slice-0-1` / `15e1f10fed5b180d40ce4265f47783f5c9589551`.
- Web deployment: `7r9kELWdevoLwkZh34noezRiVugt` (Ready).
- API deployment: `9roRYxJjYqEckNHourScFtNTYnSb` (Ready).
- Preview Neon branch: `br-sparkling-sun-ay5943bs`; applied `202609040002_profile_visual_assets.sql` in a transaction with advisory lock and migration ledger entry. Source checksum: `1f2242a71596baa4e33a7d3ab593d3fcb60af57589011c2e659f4a4afa94c40d`. Console execution used whitespace-compacted SQL; all 33 statements completed including COMMIT.
- Production database and production deployments were not changed.

## Storage configuration fix

The `aifans-public` R2 CORS configuration omitted the fixed Preview Web origin. Added only `https://ai-parter-v1-web-git-codex-ux-slice-0-1-ruihao-luos-projects.vercel.app`, preserving production and localhost origins, GET/PUT/HEAD, Content-Type, ETag, and 3600-second max age. Preflight changed from 403 to 204 with the exact allowed origin. Bucket remains signed-write; no wildcard added.

## Observed browser verification

- Stable Preview profile links to standalone edit page.
- Pure-color background save returned to profile; original paper color restored.
- Project logo used as test avatar and background: both uploads confirmed, combined save succeeded, persisted avatar loaded from R2 (`complete && naturalWidth > 0`), background image remained selected on re-opening editor.
- Test avatar and background were removed through the editor; original initial avatar and paper background restored. Uploaded test objects may remain unbound pending cleanup.

## Still incomplete — do not report full acceptance

- Human comment and notification author contracts/projections/renderers omit avatar data. Historical and newly-created human comments need live profile avatar projection and shared rendering.
- Public human profile support is absent; existing public profile routes serve IP profiles.
- Expired/unbound and retired profile image cleanup has not been implemented (only immediate staging deletion after confirmation exists).
- Actual phone and medium/large viewport visual acceptance remains outstanding.

The editor/upload release is available for testing; the complete originally agreed feature is not yet accepted.
