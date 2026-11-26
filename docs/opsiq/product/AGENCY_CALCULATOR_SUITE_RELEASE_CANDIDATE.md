# Agency calculator suite: commercial release candidate (assessment, not an authorization)

RELEASE_HOLD stays ACTIVE. Nothing here authorizes a merge, deployment, promotion or environment change. A release needs a separate written authorization naming the exact commit SHA.

## What the candidate is
One isolated change set on top of the verified live application commit:

| Item | Value |
|------|-------|
| Live deployment | `dpl_FoU8kC4FtsDjASA8zNd2fxA9EX9X`, production, READY |
| Live commit (candidate base) | `37370e28e212d9fe38a8baa9c839e6364b4c3df2` (merge of PR #675) |
| `main` at assessment time | 74 commits and 335 files ahead of live: NOT part of this candidate |
| Candidate content | live + PR #727 (cherry-picked unchanged) + PR #728 (cherry-picked, then extended) + the calculator suite |

The candidate SHA is reported with the pull request or hand-over message, because a commit cannot contain its own SHA. Reproduce the complete diff with `git diff 37370e28e212d9fe38a8baa9c839e6364b4c3df2 <candidate-sha>`.

## Complete release diff (42 files, +3,008 / −18 excluding the two documents in `docs/`)
- **Reused existing work:** PR #727 (`AgencyResultInvitation`, result-level CTA tracker position, event location type; 7 files) and PR #728 (privacy copy; 2 files, then extended to cover calculator events).
- **New pure engines:** `src/services/tools/agency/` (shared validation, six engines, registry) and its test file.
- **New UI:** `src/components/tools/agency/` (one calculator shell, config, content, page template, events tracker, metadata helper), seven route files under `src/app/tools/`.
- **Changed existing files:** the existing profit-margin calculator page (adds a direct `/agency` link and related calculators; URL and calculator unchanged), `PublicSiteHeader` (Calculators now links to `/tools`), `sitemap.ts`, `public-page-analytics.ts` (allowlist now comes from the registry), `clarity-policy.ts` (agency calculators excluded from Clarity), `privacy/page.tsx`.
- **Tests:** engine fixtures, component and browser-behaviour tests, and updates to five existing tests whose assertions described the old behavior (sitemap list, analytics allowlist, header link, privacy text, Clarity boundary).
- **Not touched:** `prisma/`, `package.json`, `package-lock.json`, `vercel.json`, `.github/`, every API route, auth, billing, policies, scheduler, scripts. Zero new dependencies and zero database changes (verified by diff).

## Compatibility with production state
- **Database:** no schema or query change; the new code imports nothing from the database layer. The four migrations applied after the live commit (`search_console_metrics`, `usage_event_quota_reservations`, `subscription_last_event_id`, `subscription_stripe_subscription_created_at`) are additive and finished, and the live commit has been running against that database since they were applied. The candidate adds no new dependency on them.
- **Runtime database role:** unchanged. The pages are statically prerendered and make no database or API call.
- **Cron and scheduler:** `vercel.json` is identical to live, so cron entries are unchanged.
- **Security controls and authentication:** untouched. The one policy change is a tightening: six pages are excluded from Microsoft Clarity session replay, and links into them are full-document navigations.

## Why main must not be deployed instead
Deploying `main` would release 74 unrelated commits (73 API route files, authentication and tenant-isolation changes, quota enforcement, Stripe and Paddle webhook rewrites, role assignment and scheduler changes, four migrations' worth of code paths). It would not add any calculator, because public pages are identical between live and `main`. The candidate must be deployed as its own commit.

## Supported deployment path (verified from tool schemas and project state; none executed)
1. **Do not use the production deploy hook or merge to `main`.** The hook and `main` deploys build `main` and would ship the 74 commits. `main` also carries the `git.deploymentEnabled.main=false` freeze.
2. **Recommended: a production-target deployment built from the exact candidate SHA** using the Vercel deployment API with a GitHub `gitSource` (`ref` = the candidate branch, `sha` = the authorized SHA) and `target: "production"`. It builds with Production environment variables, which is why it is preferred over promoting a preview build.
3. **Not recommended: promoting a preview deployment.** Promotion does not rebuild, so the result keeps Preview environment variables. Use it only after Production and Preview variables are proven equivalent.
4. **Unverified setting:** whether the project assigns production domains automatically when a production-target deployment becomes READY. Assume it does (immediate go-live) and treat the deploy as the release moment, with the rollback below ready.
5. **Accidental deployment check:** pushing the candidate to a non-`main` branch creates only a Preview deployment (the project's production branch is `main`). Previews are behind Vercel SSO protection (`prod_deployment_urls_and_all_previews`), so public visitors cannot reach them. A production deployment happens only through step 2 or 3 above, both explicit API actions.

## Required verification before release (all read-only or local except the last)
1. Same SHA green in CI (see the result reported with the candidate).
2. `git diff <live> <sha>` shows no file outside the list above.
3. Owner or authorized session inspects the Preview deployment (SSO required): hub, six calculators, existing calculator, `/agency` result invitation, privacy page; mobile width.
4. After a release only: one controlled owner session completes one calculator and clicks one agency link, noting the UTC time window to exclude from analysis, then reads the provider's custom-event aggregate for `calculator_start`, `calculator_complete`, `calculator_agency_diagnostic_click`. Until that read shows rows, provider ingestion is UNVERIFIED.

## Rollback
`request_rollback` to `dpl_FoU8kC4FtsDjASA8zNd2fxA9EX9X`. It is an alias change, takes effect without a rebuild, and there is no data to undo because the candidate writes nothing. Confirm by loading `/agency` and `/tools/profit-margin-calculator` and checking the new routes return 404 again.

## Risks that remain
- The deployment path off `main` has not been exercised in this project; step 2 is the first use. The rollback target is the known-good live deployment.
- Zero custom events have been recorded since 1 November. Local proof that events are sent is not proof the provider ingests them (plan limits are one possible cause; not verified). The candidate does not depend on events to function.
- Microsoft Clarity masking is configured in the Clarity dashboard and cannot be verified from code. The agency calculators are excluded from Clarity in code, so they do not depend on it.
