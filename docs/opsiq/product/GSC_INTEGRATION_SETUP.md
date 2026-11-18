# Google Search Console (GSC) integration — setup runbook

Status: DRAFT, branch-only, code-only. Nothing in this document or the code it describes has
been provisioned, enabled, or run against a live Google Cloud project or a live Search Console
property. `GCP_RESOURCES_CREATED=NO`, `SERVICE_ACCOUNT_GRANTED_ON_PROPERTY=NO`,
`FIRST_LIVE_INGEST_AUTHORIZED=NO`. No live Google credential exists anywhere in this repository
or in CI; every test runs against fixtures/mocks (see "Proof" below).

## What this adds

A read-only Search Console integration for the property **`sc-domain:opsiq.solutions`**, scoped
to `https://www.googleapis.com/auth/webmasters.readonly` only — this integration can never write
to, change settings on, or submit anything to Search Console.

- `src/lib/integrations/search-console.ts` — the client. Wraps three GSC v1 operations:
  `searchanalytics.query` (clicks/impressions/CTR/position, grouped by query/page/device/
  country), `sitemaps.list`, and `urlInspection.index:inspect`. Hand-rolled REST over `fetch`
  (no `googleapis` / `google-auth-library` dependency added — matches the existing
  `google-sheets-oauth.service.ts` convention of hardcoded Google hosts + injectable
  `fetchImpl`, so this repo gains zero new runtime dependencies).
- `src/services/external-systems/search-console-ingestion.service.ts` — calls the client for one
  report date and **upserts** each row into the new `SearchConsoleMetric` table, keyed by a
  deterministic hash of `(siteUrl, date, query, page, device, country)`. Re-running it for a date
  it already has never creates a duplicate row — it updates the existing one, which also lets it
  pick up Google's own revisions to a day's numbers (GSC can still be finalizing a day's data for
  a few days after it first appears).
- `prisma/schema.prisma` / `prisma/migrations/20261117120000_add_search_console_metrics/` — the
  new, empty, additive `search_console_metrics` table. Not workspace-scoped: this tracks OpsIQ's
  own property, not a per-tenant customer connector.
- `scripts/ingest-search-console.ts` (`npm run gsc:ingest -- --date=YYYY-MM-DD`) — a manual entry
  point. **Not wired to any `schedule:`/cron trigger.** Wiring it up is an explicit, separate,
  owner-authorized follow-up once a real credential exists and a first supervised run has been
  reviewed — exactly the same two-step discipline this repo already uses for e.g. the R2 backup
  workflows (see `docs/opsiq/product/R2_BACKUP_RUNBOOK.md`).

## Reporting delay — data is never "today's"

Search Console's performance data (`searchanalytics.query`) is typically **2-3 days behind**.
Every result from the client carries an explicit `freshness` object
(`computeDataFreshness()`) stating the exact report date, Google's stated delay window, and
whether the requested date falls inside it — nothing in this integration presents GSC data as
live/current. The ingestion script's own default date (when `--date` is omitted) is always
`GSC_REPORTING_DELAY_DAYS_MAX` (3) days before "now", for the same reason.

## Typed failure handling

All three client operations map Google's error responses onto this repo's existing
`src/infra/errors.ts` hierarchy (the same mapping convention as
`google-sheets-oauth.service.ts`):

| Google response | Thrown as | Meaning here |
|---|---|---|
| 401 | `UnauthorizedError("AUTH_INVALID", …)` | Credential itself is invalid/expired |
| 403 | `UnauthorizedError("AUTH_REVOKED", …)` | Most likely: the service account has not been granted access on the property yet — message points at the exact owner step below |
| 404 | `NotFoundError("Search Console property", …)` | Property not found for this credential |
| 429 | `TooManyRequestsError(…, { retryAfterSeconds })` | Quota/rate-limit — retryable, `Retry-After` passed through when Google sends it |
| 5xx | `ServiceUnavailableError("SYSTEM_DEGRADED", …)` | Google-side outage |
| 200, no `rows` field | returned as `{ rows: [], rowCount: 0, … }` — **not an error** | A verified-but-empty / brand-new property, or a zero-traffic date range |
| 200, `rowCount === rowLimit` | `possiblyIncomplete: true` on the result | Google may be truncating silently at the row limit; the caller is told explicitly rather than assuming the returned rows are the complete set |

## Proof — fixtures only, no live call anywhere

`src/__tests__/lib/search-console.test.ts` and
`src/__tests__/services/external-systems/search-console-ingestion.service.test.ts` mock every
Google response (success, 401, 403, 429 with `Retry-After`, 5xx, the empty-property/no-`rows`
case, and a truncated/`possiblyIncomplete` case) via an injected `fetchImpl` — the same pattern
`google-sheets-oauth.service.test.ts` already uses. `search-console-ingestion.service.test.ts`
additionally mocks `@/lib/db` entirely, so no test opens a real database connection either.
`npx tsc --noEmit`, `npx eslint` on the changed files, and `npx vitest run` on both files pass
with zero live credentials configured.

## Owner provisioning steps (not done by this PR — exact order)

No step below has been executed. This is a code/proof mission only.

1. **Create or select a GCP project.** Google Cloud Console → a project dedicated to this (or an
   existing OpsIQ GCP project, if one already exists for another integration). Record the
   project ID.
2. **Enable the Search Console API** on that project: APIs & Services → Library → "Google Search
   Console API" → Enable. (The underlying REST surface this client calls — `webmasters/v3` for
   `searchanalytics.query`/`sitemaps.list` and `searchconsole.googleapis.com/v1` for
   `urlInspection` — is served by this one API product.)
3. **Create the service account.** IAM & Admin → Service Accounts → Create Service Account. No
   project-level IAM role is required for Search Console access itself — Search Console access
   is granted entirely on the *property* (step 5), not via GCP IAM roles. Record its email,
   e.g. `gsc-reader@<project-id>.iam.gserviceaccount.com`.
4. **Decide Option A (JSON key) or Option B (Workload Identity Federation)** — see the comparison
   below — and complete the matching sub-steps (4A or 4B) before step 5.

   ### Option A — download a JSON key (simple path)
   4A.1. Service account → Keys → Add Key → Create new key → JSON. Download it once; Google does
        not retain a copy.
   4A.2. Store the full JSON as a secret, **never committed to this repo**:
        - Local/dev: put it in `.env` (not `.env.example`) as `GSC_SERVICE_ACCOUNT_KEY_JSON`
          (single-line JSON) — see `.env.example` for the exact variable names.
        - GitHub Actions: store it as a repository or Environment secret
          (`GSC_SERVICE_ACCOUNT_KEY_JSON`, or base64 it into
          `GSC_SERVICE_ACCOUNT_KEY_BASE64` if your workflow prefers a single-line secret) —
          following this repo's existing convention of environment-scoped secrets (see the
          `backup-write`/`backup-recovery` environments in `R2_BACKUP_RUNBOOK.md` for the
          pattern, though this integration needs only one, read-only credential, not a
          multi-environment split).
        - Vercel: Project → Settings → Environment Variables, scoped to the environment(s) that
          will run `scripts/ingest-search-console.ts`.
   4A.3. **Tradeoffs**: fastest to set up; no GCP Workload Identity configuration needed. But it
        is a long-lived secret — if it leaks, it is valid until manually revoked (Service
        Account → Keys → Delete), and nothing in this scaffold rotates it automatically. Fine as
        a starting point; Option B is the better end state for anything running in GitHub
        Actions long-term.

   ### Option B — Workload Identity Federation (no long-lived key)
   Only relevant for GitHub Actions (this is what `google-github-actions/auth`
   (https://github.com/google-github-actions/auth) implements) — Vercel's own build/runtime
   environment has no equivalent OIDC-to-GCP exchange, so Option B only removes the long-lived
   key from the *GitHub Actions* execution path; a Vercel-hosted cron would still need Option A
   (or a separate, Vercel-specific OIDC integration this scaffold does not build).
   4B.1. Create a Workload Identity Pool: `gcloud iam workload-identity-pools create "github" \
        --project="<project-id>" --location="global" --display-name="GitHub Actions"`.
   4B.2. Create an OIDC provider in that pool, issuer `https://token.actions.githubusercontent.com`,
        mapping at minimum `google.subject=assertion.sub` and
        `attribute.repository=assertion.repository`, **with an attribute condition** restricting
        it to this repo, e.g. `assertion.repository == 'arnab-netizen/OPsIq'` — the
        `google-github-actions/auth` docs are explicit that an unrestricted pool is unsafe.
   4B.3. Grant the GitHub principal `roles/iam.workloadIdentityUser` on the service account from
        step 3 (not a project-level role), scoped to a `principalSet://` member naming this
        repo, so only workflow runs from this exact repository can impersonate it.
   4B.4. Record the full provider resource name (`projects/<number>/locations/global/
        workloadIdentityPools/github/providers/<provider-name>`) for `workload_identity_provider`
        below.
   4B.5. In the GitHub Actions workflow that will eventually run the ingestion script (not yet
        created by this PR — see "Not wired to any schedule" above), add:
        ```yaml
        permissions:
          contents: 'read'
          id-token: 'write'
        steps:
          - uses: actions/checkout@v7
          - id: auth
            uses: google-github-actions/auth@v3
            with:
              project_id: '<project-id>'
              workload_identity_provider: 'projects/<number>/locations/global/workloadIdentityPools/github/providers/<provider-name>'
              service_account: 'gsc-reader@<project-id>.iam.gserviceaccount.com'
              token_format: 'access_token'
              access_token_scopes: 'https://www.googleapis.com/auth/webmasters.readonly'
          - run: npm run gsc:ingest -- --date=2026-11-14
            env:
              GSC_ACCESS_TOKEN: ${{ steps.auth.outputs.access_token }}
        ```
        This module (`getSearchConsoleAuthFromEnv()`) reads that token straight from
        `GSC_ACCESS_TOKEN` — it performs no OIDC/STS exchange itself; `google-github-actions/auth`
        has already done that by the time this script runs. No long-lived secret is stored in
        GitHub at all in this path.
   4B.6. **Tradeoffs**: no long-lived key to leak or rotate, and access is bound to this exact
        repository by the attribute condition in 4B.2 — strictly more secure. Costs more setup
        time (pool + provider + IAM binding, each taking up to ~5 minutes to propagate per
        Google's own docs), is GitHub-Actions-specific (does not help a Vercel-hosted path), and
        needs the Google Cloud CLI or Console access to configure. Prefer this for the long term
        if ingestion ends up running from GitHub Actions; fall back to Option A for anything
        Vercel-hosted or for the fastest possible first run.

5. **Grant the service account access on the property — the step neither option above can skip.**
   Search Console (https://search.google.com/search-console) → select the
   `sc-domain:opsiq.solutions` property → Settings → Users and permissions → Add user → paste the
   service account's email from step 3 → permission level **Restricted** (sufficient for every
   read-only operation this client calls; Full is not needed and should not be granted). Without
   this step, every call from this client returns 403 — which the client surfaces with a message
   naming this exact step (see the error table above).
6. **Choose where the credential/token lands** (per Option A/B above) and set
   `GSC_SITE_URL=sc-domain:opsiq.solutions` alongside it. See `.env.example` for the exact
   variable names (`GSC_ACCESS_TOKEN`, `GSC_SERVICE_ACCOUNT_KEY_JSON`,
   `GSC_SERVICE_ACCOUNT_KEY_BASE64`, `GSC_SITE_URL`).
7. **Apply the new migration** (`20261117120000_add_search_console_metrics`) against the target
   database with `npm run db:migrate:deploy` (or `db:migrate:dev` locally) before the first
   ingestion run — the table does not exist until this runs.
8. **Run `npm run gsc:ingest -- --date=<a date already inside the reporting-delay window>` once,
   by hand, and inspect the output** (rows fetched/written, the freshness note, and
   `possiblyIncomplete`) before considering any further automation.
9. **Only then**, in a separate, owner-authorized change: add a GitHub Actions workflow with a
   `schedule:` trigger (or a Vercel Cron route) that runs `scripts/ingest-search-console.ts`
   daily. This PR deliberately does not create that workflow.

## First live ingest is not authorized by this document

Even once this code is reviewed and merged, do not create the GCP service account, add it to the
Search Console property, store a real credential anywhere, or dispatch a real ingestion run until
the owner has personally completed steps 1-7 above and reviewed the output of one manual run
(step 8). `GCP_RESOURCES_CREATED=NO` and `SERVICE_ACCOUNT_GRANTED_ON_PROPERTY=NO` remain true
until the owner actually performs those steps — code readiness is not the same as live
provisioning.
