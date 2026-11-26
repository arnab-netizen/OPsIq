# Agency calculator suite: commercial release candidate (R27)

RELEASE_HOLD stays ACTIVE. Nothing here authorizes a merge, deployment, promotion or environment change. A release needs a separate written authorization naming the exact commit SHA of the dedicated branch tip.

## What the candidate is
One linear change set on top of the verified live application commit, on its own branch.

| Item | Value |
|------|-------|
| Dedicated branch | `release/agency-calculator-suite-r27` (authorized for this purpose only; never a pull-request head) |
| Live deployment | `dpl_FoU8kC4FtsDjASA8zNd2fxA9EX9X`, production, READY |
| Live commit (base) | `37370e28e212d9fe38a8baa9c839e6364b4c3df2` (merge of PR #675) |
| Ancestry | linear: live, then PR #727 content, PR #728 content, the suite, then fixes. `git merge-base` with live equals live. |
| `main` | 74 commits ahead of live at assessment time. None of them are in this candidate. |

The candidate SHA and tree hash are reported with the hand-over message, because a commit cannot contain its own SHA. Reproduce the complete diff with `git diff --stat 37370e28e212d9fe38a8baa9c839e6364b4c3df2 <candidate-sha>`. At execution time the branch tip must equal the authorized SHA before anything is built from it.

## Complete release diff
- **Reused existing work:** PR #727 (`AgencyResultInvitation`, result-level CTA position, event location type) and PR #728 (privacy copy), re-applied onto live and then extended.
- **New pure engines:** `src/services/tools/agency/` (shared validation, six engines, registry) with 67 hand-calculated tests.
- **New UI:** `src/components/tools/agency/`, seven route files under `src/app/tools/`.
- **Changed existing files:** the existing profit-margin calculator page and its badge/banner colors, `PublicSiteHeader`, `sitemap.ts`, `public-page-analytics.ts`, `clarity-policy.ts`, `privacy/page.tsx`, and five existing tests whose assertions described the old behavior.
- **Documents:** the phase-two specification and this file.
- **Not touched (verified by diff):** `prisma/`, `package.json`, `package-lock.json`, `vercel.json`, `.github/`, every API route, auth, billing, policies, scheduler, scripts, `.claude/`. Zero new dependencies, zero database changes.

## Correctness fixes made in R27
| Defect | Result |
|--------|--------|
| A. Client profitability labor cost | A blank rate is not free labor. Hours with a blank rate is an error for either role; an explicit 0 is accepted and flagged as unpaid time. Missing payroll cost can no longer overstate profit. |
| B. Capacity | Planned new clients with a blank, zero or negative workload per client withholds the planned assessment. |
| C. Retainer sustainability | Four states: other costs exceed the budget, other costs equal the budget, hours limited by cost, hours not limited by cost. Never "unlimited capacity". |
| D. Target margin | Compared unrounded with a 1e-9 tolerance; 49.96% against a 50% target is shown as a miss (with two decimals when one decimal would hide it). |
| Extra checks | Hours reduction beyond available hours, required versus retained fee, minimum prices round up, divisors below 0.01, non-finite and out-of-range output, exact-to-cent limits, zero cost, zero revenue, negative margins, allocated versus cash labor, no double-counted pass-through. |

## Privacy and analytics
- **Clarity:** all seven financial calculators (the existing profit-margin calculator and the six new ones) are excluded in code. Links across the eligible/ineligible boundary are full-document navigations, so the Clarity runtime cannot survive into a calculator. Tested in a production-equivalent build with consent granted: the Clarity tag is requested on an eligible page and never on any calculator, the hub, or `/agency`.
- **Web Analytics:** only five approved custom event names with fixed, non-sensitive properties (calculator id and a fixed position). No entered value, result, or URL query is ever sent. Explicit copy-to-clipboard stays local.
- **`calculator_complete`** means: the visitor edited at least one input, the inputs now differ from the preloaded sample, and the calculation succeeded. It is sent once per page view. It does not claim business intent or identity.
- **Transmission proof (local, intercepted, synthetic):** with `VERCEL_ENV=production` the Analytics component mounts; the SDK queue is processed; events arrive at the insights endpoint with the approved names and fixed properties; deduplication, full-document-navigation delivery, no event for invalid input, no event from sample state, and failure isolation with the provider script blocked are each asserted (39 checks). The test uses a stand-in for Vercel's script, so it proves what the application hands to the provider and when; it does not prove provider ingestion.
- **Provider ingestion is UNVERIFIED** until a controlled production test. Custom-event availability on the current plan is also unverified. The candidate does not depend on events to function.

## Test evidence (local, exact working tree)
- Type-check, ESLint on all changed files (0 errors), repository lint ratchet (870 warnings against a baseline of 871), production build.
- 476 of 476 tests pass in the calculator, engine, analytics and Clarity directories.
- Full suite with a throwaway Postgres 16 (loopback only, no production credentials): 59 tests in nine pre-existing files fail identically on the live commit and on the candidate (same 59 of 213, same lines), so they are not introduced by this change. The five signup tests previously reported as failing pass on a throwaway database.
- Browser: 201 behavior checks plus 39 production-equivalent privacy and analytics checks, all passing.
- Automated accessibility: axe-core WCAG 2.1 A/AA and best-practice rules, 0 violations over 42 page-states (nine pages, desktop and phone, default, error and result states). Real Tab navigation shows a visible focus indicator on every focusable type present.
- **Not done:** manual screen-reader testing and real-device testing. Automated checks are not an accessibility acceptance.

## Compatibility with production state
- **Database:** no schema or query change; the new code imports nothing from the database layer. The four migrations applied after the live commit are additive and finished; the live commit already runs against that database. No migration is needed and no grant changes.
- **Runtime role, cron, scheduler, GSC ingestion, watchdog:** untouched. `vercel.json` is identical to live, so cron entries are unchanged. The scheduled GSC ingestion workflow lives in `.github/`, which this candidate does not touch.
- **Deployment freeze:** the `git.deploymentEnabled.main=false` freeze is a setting in `main`'s `vercel.json` and only governs pushes to `main`. A deployment of this branch neither reads nor changes it, and nothing in the candidate edits it. The candidate's `vercel.json` matches the live file. Project-level settings are not changed by deploying a commit.

## Why main must not be deployed instead
Deploying `main` would release 74 unrelated commits (API routes, authentication, tenant isolation, quota enforcement, billing webhooks, scheduler changes) and would add no calculator, because public pages are identical between live and `main`.

## Deployment procedure (documented only; nothing executed)
1. **No production deploy hook, no merge to `main`, no deploy of `main`.**
2. **Pre-flight at execution time:** read the branch tip; it must equal the authorized SHA; read the tree hash; confirm the diff against live lists no file outside the set above.
3. **Release action:** a production-target deployment built from the exact SHA through the Vercel deployment API with a GitHub `gitSource` (`org`, `repo`, `ref` = the dedicated branch, `sha` = the authorized SHA) and `target: "production"`. It builds with Production environment variables.
4. **Staged deployment is not available through the connected tool.** The connector exposes no skip-domain parameter. The staged flow (`vercel deploy --prod --skip-domain`, inspect, then `vercel promote`) needs the CLI. Therefore the production-target deployment is the release moment, not a staged step. Whether the project assigns production domains automatically cannot be read through the connector and is UNVERIFIED; assume immediate go-live.
5. When both `ref` and `sha` are supplied, which one wins was not exercised and stays unverified. The tip check in step 2 removes the ambiguity.
6. **Promoting a preview** is not recommended: promotion does not rebuild and keeps Preview environment variables.
7. Pushing the branch only ever creates a Preview deployment (the production branch is `main`). Previews are behind Vercel SSO protection.

## Rollback
- Expected target: `dpl_FoU8kC4FtsDjASA8zNd2fxA9EX9X` (current live; confirmed READY and production-target).
- `request_rollback` to that deployment. It reassigns aliases without a rebuild. There is no data to undo because the candidate writes nothing.
- Instant Rollback turns off automatic domain assignment for the project. After a rollback, new production deployments will not go live by themselves, which matches the release hold. Re-enabling automatic assignment is a separate owner decision.
- Rollback triggers: wrong commit deployed; any alias change not authorized; a public route returning errors; a regression on an existing page; any privacy violation (a financial calculator loading Clarity, any entered value in an analytics request); database errors; cron or scheduler regression; authentication failure; any security-control regression.
- Verify after rollback: `/agency` and `/tools/profit-margin-calculator` load, and the six new routes return 404 again.
- No test rollback is to be run on a healthy production.

## Incident record: branch publication
In R26 the candidate was pushed onto `claude/upbeat-archimedes-gyd1ex`, which is the head of draft PR #725, and altered that pull request. It was repaired with a fast-forward restore commit (tree identical to the previously authorized state; the PR shows its original 11 files). **Preventive control:** a release candidate gets its own dedicated, authorized branch and is never pushed onto a pull-request head; the branch tip is compared with the authorized SHA before any build.

## Remaining limitations
- Provider ingestion of custom events is unverified until one controlled production test after release.
- Accessibility acceptance is automated plus keyboard and focus checks only.
- Microsoft Clarity masking is configured in the Clarity dashboard and cannot be verified from code; the calculators do not depend on it.
- Nine existing test files have 59 failures that are identical on live. They need their own root-cause pull request, not a change here.
- CI for this exact SHA must be run as a separate validation (see the hand-over message); a cancelled run is not a pass.
