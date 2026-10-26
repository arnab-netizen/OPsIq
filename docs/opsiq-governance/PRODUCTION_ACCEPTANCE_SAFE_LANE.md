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
