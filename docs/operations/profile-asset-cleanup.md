# Profile image cleanup

Status: implemented, **not automatically scheduled or activated**. Apply migration
`202609040004_profile_asset_cleanup.sql` to the intended environment before enabling.

## Configuration and invocation

Set API-only `PROFILE_ASSET_CLEANUP_SECRET` to a separately generated secret of at
least 32 characters. The worker uses that environment's existing
`DATABASE_PLATFORM_URL` and public R2 configuration. It does not need an owner DB
credential or additional table grants. Keep the secret out of the browser and logs.

To invoke one batch, set `PROFILE_CLEANUP_API_URL` to the **intended test API** and
load `PROFILE_ASSET_CLEANUP_SECRET` securely in the shell. Do not use shell tracing.
This example sends the authorization header through stdin rather than process args:

```sh
printf 'Authorization: Bearer %s\n' "$PROFILE_ASSET_CLEANUP_SECRET" |
  curl --fail-with-body --silent --show-error --request POST \
    --header @- "${PROFILE_CLEANUP_API_URL}/internal/profile-assets/cleanup"
```

No request body or query parameters are accepted. The JSON response contains only
`processed`, `deleted`, and `failed` counts. A nonzero `failed` count means some
storage deletions need retry, even when HTTP status is 200. Database failures return
500; missing configuration returns 503; invalid authorization returns 401.

## Bounds and safety

- Each invocation considers at most 10 reservations and uses a 20-second deletion
  budget; an in-progress R2 deletion has a 3-second timeout. Database statements
  have a 5-second timeout. These are separate bounds, not a whole-request SLA.
- Staging objects and unconsumed finals become eligible 24 hours after reservation
  expiry. This also retries staging removal that failed during upload confirmation.
- Replaced consumed finals become eligible 24 hours after replacement. Previously
  orphaned consumed finals get a fresh 24-hour grace period when migration runs.
- Current avatar/background references are always excluded. The worker locks the
  owner profile before its reservation, rechecks eligibility, and holds locks through
  exact-key deletion. Concurrent edits/jobs are skipped, not waited on.
- Successful deletions are recorded; failures remain eligible. Repeating a delete
  after a transaction failure is safe. No prefix listing/deletion or blanket R2
  expiry policy is used. **Never set bucket expiry on `public/profiles/`.**

## Scheduling

Vercel Preview deployments do not run Vercel Cron. No Vercel schedule was added,
and this work does not activate a production job. For test automation, an explicitly
approved external scheduler can call this POST endpoint, for example every hour,
with the environment-specific secret and any required Preview protection bypass.
Monitor HTTP failures and the `failed` count. Increase invocation frequency if a
backlog exceeds the fixed batch size; the caller cannot increase deletion scope.
Schedule activation and destination approval remain separate operational steps.
