# Isolated realtime test deployment — 2026-09-04

## Recorded state

Operator-reported Cloudflare account: `44ceaad318c815a8f3ee980b8c722fe3`; Worker: `aifans-realtime-isolated-test`; initial deployed version: `66941970-81f9-4509-921c-ba2b6e111500`.

The Worker is **not connected end-to-end**. Its public URL remains disabled (`workers_dev: false`, `preview_urls: false`); no route is added by this configuration. The operator confirmed the optional `VERCEL_AUTOMATION_BYPASS_SECRET` binding through the remote secret-name listing. No secret value is recorded here. API internal authentication and Vercel/Neon environment integration remain pending. No real Dify provider is configured or exercised by this record.

The local Wrangler test environment now pins these non-secret values:

- `ALLOWED_ORIGINS`: `https://ai-parter-v1-web-git-codex-ux-slice-0-1-ruihao-luos-projects.vercel.app`
- `UPSTREAM_API_URL`: `https://aifans-api-dev-git-codex-ux-slice-0-1-ruihao-luos-projects.vercel.app`

This change performs a local bundle dry run only, not a remote deployment. The initial version above must not be interpreted as containing this later local configuration until an operator deploys it.

## Configuration and verification matrix

| Surface | Required configuration | Remaining gate |
| --- | --- | --- |
| Worker | Exact origins/API origin above; server-only `REALTIME_INTERNAL_SECRET`; optional server-only `VERCEL_AUTOMATION_BYPASS_SECRET` | Match the API internal secret through authorized provisioning; deploy configuration only after API readiness |
| API | `HUMAN_SOCIAL_ENABLED=true`; distinct `REALTIME_TICKET_SECRET` and `REALTIME_INTERNAL_SECRET`; `REALTIME_ISSUER`, `REALTIME_AUDIENCE`, exact `REALTIME_ALLOWED_ORIGINS` | Verify intended test database migrations, authenticated ticket issuance and internal redemption/authorization before public exposure |
| API → Worker | `REALTIME_GATEWAY_URL` set to the operator-approved HTTPS Worker origin | Origin is not yet enabled/recorded; verify authenticated delivery, status reads, and scheduled retries |
| Web | `AIFANS_API_URL` set to the test API; `NEXT_PUBLIC_REALTIME_URL` set to the approved `wss://` gateway URL only when ready | Verify browser origin matching, HUMAN and AI subscriptions, reconnect and logout revocation |
| Test database | Dedicated Neon test database and migrations through realtime revocation epoch `016` | Operator must verify deployment migration ledger and roles; local scratch results do not establish remote readiness |
| Dify | Optional `DIFY_API_URL` and server-only `DIFY_API_KEY`, configured together only under separate authorization | No real-provider request or billing verification has occurred |

Keep Vercel SSO protection enabled. The Worker automation header bypasses deployment protection only for its fixed upstream server requests; it does not replace API internal bearer authentication. Never place either secret in Wrangler `vars`, browser/public variables, URLs, logs, or this document. Public access stays disabled until the operator completes internal authentication and approves the remaining connectivity checks.

## Local verification

Run `pnpm --filter @aifans/realtime check:bundle` from the repository root. This resolves the explicit `test` environment and produces a local bundle with `--dry-run`; it does not publish the Worker or enable URLs. End-to-end network connectivity, deployed hibernation/alarms, and real-provider behavior remain unverified.
