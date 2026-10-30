# Production acceptance: the safe lane

`.github/workflows/production-owner-acceptance.yml` ("Production Owner Acceptance (LIVE)") runs real browser
journeys against Production as the Production acceptance account. This document defines which specs may run
there, how that is enforced, and the one known gap.

## Rule

The live lane runs **only** the specs that `tests/production/production-spec-manifest.json` marks
`safeLane: true`. Playwright's `*.spec.ts` auto-discovery is **not** used.

Enforcement, in three independent layers:

1. `scripts/production-safe-specs.cjs` resolves the safe list and **fails closed** (exit 1, nothing on stdout)
   when any `tests/production/*.spec.ts` is unclassified, a manifest entry has no file, a classification is
   `UNKNOWN` or not one of the five allowed values, a safe entry is `NON_FIXTURE_PERSISTENT_MUTATION`, a
   `FIXTURE_ISOLATED_MUTATION` entry has no `fixtureMechanism`, a `REVERSIBLE_REAL_DATA_MUTATION` entry has no
   `rollback`, or an excluded entry has no `exclusionReason`.
2. `playwright.production.config.ts` sets `testMatch` from that resolver, and the workflow passes the same
   resolved list to `npx playwright test` as explicit file arguments.
3. `src/__tests__/deployment/production-acceptance-mutation-classification.test.ts` fails CI if a spec is
   unclassified, the safe set differs from the reviewed expected set, a safe spec bypasses the fixture helpers or
   touches a known persistent non-fixture endpoint, or the workflow returns to directory discovery.

Adding a spec to the lane is a deliberate two-key change: the manifest entry **and** the expected list in that
test.

## Classifications

| Value | Meaning | In the live lane |
|---|---|---|
| `READ_ONLY_REAL_DATA` | Only reads real data | yes |
| `FIXTURE_ISOLATED_MUTATION` | Writes only to fixture rows created through the dedicated acceptance-fixture routes; hidden from ordinary owners | yes |
| `REVERSIBLE_REAL_DATA_MUTATION` | Writes real data and restores it with a governed, proven rollback | yes, with `rollback` |
| `NON_FIXTURE_PERSISTENT_MUTATION` | Writes real, owner-visible data and leaves it behind | **never** |
| `UNKNOWN` | Not understood | **never** |

## Current audit

| Spec | Classification | Scope | Fixture-isolated | Rollback | Safe lane |
|---|---|---|---|---|---|
| 10-startup-mode | FIXTURE_ISOLATED_MUTATION | fixture startup session (+ fixture business on hand-off) | yes | none (retained, hidden) | yes |
| 20-existing-business | FIXTURE_ISOLATED_MUTATION | Finance fixture business; Trinity read-only | yes | none (retained, hidden) | yes |
| 21-sales | FIXTURE_ISOLATED_MUTATION | Sales fixture business; Trinity read-only | yes | none (retained, hidden) | yes |
| 22-operations | FIXTURE_ISOLATED_MUTATION | Operations fixture business; Trinity read-only | yes | none (retained, hidden) | yes |
| 23-strategy | FIXTURE_ISOLATED_MUTATION | Strategy fixture business; Trinity read-only | yes | none (retained, hidden) | yes |
| 24-cashflow | FIXTURE_ISOLATED_MUTATION | Cashflow fixture business; Trinity read-only | yes | none (retained, hidden) | yes |
| 25-marketing | FIXTURE_ISOLATED_MUTATION | Marketing fixture business; Trinity read-only | yes | none (retained, hidden) | yes |
| 26-recovery | FIXTURE_ISOLATED_MUTATION | Recovery fixture business; Trinity read-only | yes | none (retained, hidden) | yes |
| 27-growth-pricing | NON_FIXTURE_PERSISTENT_MUTATION | workspace | **no** | **none** | **no** |

Every spec also creates an authentication session row and appends audit events. Both are append-only by design
and are not part of the per-spec classification.

Fixture isolation relies on: the dedicated `/api/admin/acceptance-fixtures/*` routes gated by the
`acceptance_fixture:write` capability, the fixture flag hard-wired server-side (no client override), the
`assertFixtureCreationCapable` preflight before any creation, `assertBusinessIsFixture` /
`assertStartupSessionIsFixture` after it, and fixture exclusion from owner list and aggregation services. No
`SYSTEM_ADMIN` dependency exists.

## Known gap: Growth Pricing

`GROWTH_PRICING_LIVE_MUTATION_SAFETY=OPEN`

`27-growth-pricing-acceptance.spec.ts` calls `POST /api/growth/pricing-tiers`, approves the tier through the UI,
then calls `POST /api/growth/pricing-tiers/:id/supersede`, which archives the original and creates a new version.
Price tiers are keyed by `workspaceId` only, so there is no fixture business to isolate them in. The tiers are
visible to ordinary owners at `/owner/growth-pricing`, feed the workspace pricing analysis, and nothing removes or
restores them. The spec is therefore excluded from the live lane.

Acceptable ways to close the gap (any one):

- **Option A, fixture semantics:** add real acceptance-fixture semantics to workspace-scoped price tiers (a
  server-side fixture flag set only by a dedicated acceptance-fixture route, excluded from every owner list and
  analysis), then classify the spec `FIXTURE_ISOLATED_MUTATION`.
- **Option B, governed reversible cleanup:** a dedicated, capability-gated, audited cleanup that identifies the
  exact rows the run created by identity, restores the prior state, and proves the restoration. Then classify the
  spec `REVERSIBLE_REAL_DATA_MUTATION` with its `rollback`.
- **Option C, split proof:** a read-only Production proof of the Growth Pricing page, with the mutating proof run
  in an isolated non-Production environment.

Not acceptable: direct Production deletes, a generic admin deletion API, or skipping or weakening the spec to make
the lane pass.

Until one of these ships and is proven, the spec stays `safeLane: false` and the live lane stays at 8 specs.

## Mutation targeting and login (Production run #17 remediation)

Run #17 showed that "the fixture was created and is hidden" is not evidence that "the mutation hit the fixture". See
`PRODUCTION_RUN17_FIXTURE_ISOLATION_FORENSICS.md` for the ledger. The rules below are enforced, not advisory.

**Option A: the Production browser UI is read-only against ordinary businesses.**

- Every Production mutation is a governed API call through `tests/production/helpers/fixture-target.ts`
  (`fixtureMutate`). It is refused, before any request is sent, unless every id in the path is the verified fixture or an
  record (snapshot, cycle, action) that a response carrying that fixture's `businessId` proved belongs to it. A different ordinary business, Trinity, another QA
  business, an unproven action id, another domain's route, an absolute URL and any query string are all refused.
- `bindFixtureTarget` runs first: the id must be absent from `/api/owner/businesses` (the list the UI selects from) and
  the recovery list, and the fixture must answer BY ID (its own snapshot list). Fixtures are hidden from every owner
  dashboard by design, so no dashboard is ever a read source for a fixture; the domain specs assert the opposite,
  positively: the dashboard must NOT resolve the fixture.
- Domain specs perform no click/fill/press at all (a governance test enforces it); the browser only reads.
- Cashflow 24-06: the live gate lets protective cash steps through at INSOLVENT_RISK, so the spec asserts a governed
  200-or-409 outcome per step (a 409 must name INSOLVENT_RISK, leave the action assigned and raise the block counter).
  The refusal rule itself is proven by `src/__tests__/owner-mode/owner-action-gate.test.ts`. The earlier expectation that
  the first action is always refused no longer matches the product policy (separate finding, owner decision).
- A query parameter is never selection proof. No owner page reads `?businessId=`; navigating to one proves nothing.
- Typed helpers (`helpers/fixture-domain-loop.ts`) carry the closed loop: snapshot, diagnosis, adopt actions, Assign,
  Start, Complete, Verify, reassessment. Request bodies are the ones the owner pages send.
- The one sanctioned UI mutation is Startup's "Activate as Business" on `/owner/startup/<fixture session>`, because that
  page really consumes the session id from its route. The hand-off business is a fixture and is asserted to be hidden
  from ordinary owner lists (positive isolation), not expected to be visible there.

**Login happens once.** `global-setup.ts` performs one real login through the login form and saves the browser state to
`/tmp/.opsiq-acceptance-auth-state.json` (outside the uploaded artifact, mode 0600, its cookie value added to the
leak-scan token log, deleted by the workflow before the upload step). Specs open contexts from it and never log in again,
so N spec files and any number of Playwright worker restarts cost zero further logins. The Startup spec uses its own
session because its logout test revokes it. The production login limiter (token bucket: capacity 10, one token per 90 s)
is a security control and is not changed.

**Enforcement.**

- `src/__tests__/deployment/production-acceptance-fixture-target-binding.test.ts`: static, fail-closed. Safe-lane specs
  may not click ordinary-UI mutation controls, navigate with `?businessId=`, send raw mutating HTTP, or build mutation
  paths from anything but the bound fixture; each domain spec must bind the id it created; login call sites are
  allowlisted; the auth state is outside the artifact and removed before upload. Detector self-tests feed it the run #17
  pattern.
- `src/__tests__/production/fixture-target-binding.test.ts`: runtime refusal against a recording fake page.
- A safe-lane spec may not import any helper that clicks buttons (the legacy UI diagnosis helpers still exist for the
  excluded Growth Pricing spec and their own tests), so a UI mutation cannot be reintroduced behind a helper.
