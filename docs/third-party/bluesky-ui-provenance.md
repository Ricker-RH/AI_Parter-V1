# Bluesky UI provenance

## Upstream review

- **Repository:** [bluesky-social/social-app](https://github.com/bluesky-social/social-app)
- **Reviewed commit:** `89c8e1cb70536ab4a05aae0d5b4654362a87ba6e`
- **Source-code license:** MIT, as recorded in that commit's `LICENSE`
- **Asset boundary:** `ASSETS.md` and `NOTICE.md` at that commit are part of
  this review and take precedence for asset provenance.

The Bluesky source code is MIT-licensed, but its repository does not grant
rights to all files in its asset tree. AIFANS must only selectively port
source files after recording them below and carrying applicable notices in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

## Excluded upstream assets

Do not import the following Bluesky assets into AIFANS:

- `assets/illustrations/`
- `assets/icons/`, except separately licensed `assets/icons/flags/`
- `assets/images/`
- `assets/app-icons/` and `assets/splash/`
- `assets/favicon*`, `assets/logo*`, and `assets/default-avatar*`

The repository-level checker enforces these path boundaries. It is a guardrail,
not a substitute for maintaining the provenance record.

## Selectively ported files

| AIFANS file | Upstream file | Upstream commit | Modifications |
| --- | --- | --- | --- |
| None yet | — | — | No Bluesky files have been ported. Add one row for each future selective port before merging it. |
