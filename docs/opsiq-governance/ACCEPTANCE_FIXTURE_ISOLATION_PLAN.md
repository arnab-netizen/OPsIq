# Acceptance-fixture isolation — plan and implementation

Status: **IMPLEMENTED** (local/dev; not yet deployed to production — see
"Rollout to production" below). No production data has been touched.

## What's implemented

- **Schema**: `OwnerBusiness.isFixtureBusiness Boolean @default(false)` —
  additive migration
  `prisma/migrations/20260908042043_add_owner_business_fixture_flag`.
- **Set at creation time**: `createBusiness(input, actorId, workspaceId, opts?)`
  in `src/services/founder-recovery/business.service.ts` accepts
  `opts.isFixtureBusiness`, defaulting to `false`. The only caller that can
  set it `true` is `POST /api/owner/recovery/businesses`, and only when the
  requesting actor holds `CAPABILITIES.SYSTEM_ADMIN` — a self-serve owner's
  request body can carry `isFixtureBusiness: true` and it is silently
  ignored without that capability (verified by
  `src/__tests__/founder-recovery/fixture-flag-rbac.db.test.ts`, which
  exercises the real route through the real canonical auth wrapper).
- **Filtered from ordinary queries**: `listBusinesses()` now filters
  `isFixtureBusiness: false` alongside the existing `isActive: true`.
- **Governed acceptance path**: `listFixtureBusinesses(workspaceId)` (same
  file) returns only fixture rows; backed by `GET
  /api/admin/fixture-businesses?workspaceId=...`, gated on
  `CAPABILITIES.SYSTEM_ADMIN`. Read-only — cleanup still goes through the
  existing governed archive path (`PATCH
  /api/owner/recovery/businesses/[id]`), never a raw delete.
- **Tests**: `src/__tests__/founder-recovery/fixture-isolation.db.test.ts`
  proves all four required invariants (real business visible, active
  fixture hidden from `listBusinesses()`, fixture reachable via
  `listFixtureBusinesses()`, workspace isolation preserved) plus a mixed
  real+fixture listing and the "no explicit opts = never a fixture" default.
- **Every real acceptance/QA business-creation path is now fixture-aware**:
  `tests/production/helpers/domain-business.ts`'s `resolveOrCreateDomainBusiness()`
  (used by 7 production acceptance specs to create their own dedicated
  business) always sends `isFixtureBusiness: true`. This does not depend on
  a human remembering to pass the flag — it is unconditional in the helper
  every spec calls. It is still only honored in practice once the
  `PRODUCTION_ACCEPTANCE_EMAIL` account itself holds `SYSTEM_ADMIN` in the
  target environment; see "Remaining gap" below.
- **Startup Mode blueprint output is also fixture-tagged, structurally**:
  `OwnerBusiness.isFixtureBusiness` only covers the business row itself.
  Startup Mode's `createBlueprint()`
  (`src/services/owner-strategy/startup-execution-blueprint.service.ts`)
  separately writes to six owner-visible-by-default record types in one
  transaction — `BusinessObjective`, `ProcessExecutionTask`,
  `KPIOwnershipRecord`, `BusinessRiskEntry`, `ResourceAllocation`,
  `ConstraintResolutionRecord` — none of which reference an `OwnerBusiness`
  row (they are workspace-scoped, not business-scoped). Before this change,
  an acceptance/QA blueprint run's tasks/risks/KPIs/goals were only
  distinguishable from a real owner's own Startup Mode use by the idea name
  embedded in their default titles — the forbidden string-matching approach.
  This adds `isFixtureRecord Boolean @default(false)` to all six models
  (migration `20260908060917_add_blueprint_output_fixture_record_flag`),
  threaded through `createBlueprint(workspaceId, actorId, input, opts?)`'s
  new `opts.isFixtureRecord`, honored by `POST
  /api/owner/startup/sessions/[sessionId]/blueprint` only when the actor
  holds `SYSTEM_ADMIN` (same pattern as `isFixtureBusiness`), and filtered
  out of every ordinary owner-facing read of those six types: `listObjectives`,
  `listBusinessRisks` (including the overdue-risk alert scan — a fixture risk
  can no longer generate a real "Risk review overdue" in-app alert),
  `listKPIOwnership`, `getPersistedProcessTasks`, `listResourcePools` /
  `getResourcePoolUtilization`, `listActiveConstraints`, and every
  corresponding direct read inside Home's aggregation
  (`owner-now-view.service.ts`'s `buildBusinessOperatingSystem` /
  `buildExecutionLifecycle`). `tests/production/10-startup-mode-acceptance.spec.ts`
  (the one production spec that runs Startup Mode end-to-end) now sends
  `isFixtureRecord: true` on its blueprint-creation call.
  Tests: `src/__tests__/owner-strategy/startup-blueprint-fixture-isolation.db.test.ts`
  (tagging + "ordinary owner sees ZERO fixture-generated records" across all
  six list surfaces) and `startup-blueprint-fixture-rbac.db.test.ts` (route-level
  SYSTEM_ADMIN gate, mirroring `fixture-flag-rbac.db.test.ts`) — not executed
  in this authoring session (no network path to the test database from this
  sandboxed environment reached the DB before the session ended); must run
  under `TEST_WITH_DB=true` in CI before this is considered proven.
  **Known limitation**: `StartupInitiative`, `StartupVerificationWindow`,
  `FundedInitiativeOutcome`, and `StartupExecutionPlan`/`StartupExecutionBlueprint`
  (session/idea-scoped reads only) are the remaining blueprint outputs and
  do **not** yet carry `isFixtureRecord` — a repo-wide read-path survey found
  no owner-facing workspace-wide list route reads the first three today, and
  the latter two are already scoped by `sessionId`, not merely `workspaceId`,
  so a real owner would have to already know/guess a QA session id to reach
  them. If any of these four gains a workspace-wide owner-facing list route
  in the future, it must get the same `isFixtureRecord` treatment before
  that route ships.

## Rollout to production

The migration above has not been deployed to the production database from
this session (no production DB access here, and doing so is a deploy-time
`prisma migrate deploy` gated by this repo's own exact-SHA merge policy and
CI). Until it deploys, the acceptance/QA account's own future business-create
calls need to pass `isFixtureBusiness: true` explicitly (and that account
needs `SYSTEM_ADMIN`) for new rows to be tagged; existing already-created
acceptance rows in production are untouched by this change (no backfill was
performed — see "Historical rows" below).

## Historical rows still in production

Rows created before this change (the ~35+ "OPSIQ Acceptance ..." businesses
the human tester saw) default to `isFixtureBusiness: false` under the
additive migration and are **not** retroactively reclassified — that would
require identifying them (most reliably by name pattern, e.g. `OPSIQ
(Production )?Acceptance`) and calling the existing governed
`updateBusiness()`/archive path or a one-time backfill script. Doing so is a
production data change and is deliberately **not** performed here without
explicit owner authorization — see `PRODUCTION_DATA_MUTATIONS = 0` in the
session's final report.

### Deterministic, fail-closed dry-run classification (built, not yet run against production)

Hiding these rows by matching their display name in React/the UI was
explicitly ruled out — a name is not provenance. Instead,
`src/domain/founder-recovery/legacy-fixture-classification.ts` exports a
pure `classifyLegacyFixtureCandidates()` function that requires **two**
independent signals to agree before proposing a row as a confident
historical-fixture candidate: (1) the name matches the established
acceptance-naming convention (`^OPSIQ (Production )?Acceptance`, anchored at
the start so a real business that merely mentions "acceptance" elsewhere in
its name never matches) AND (2) the row's `createdBy` resolves to a known
acceptance/QA actor email (sourced from the real `PRODUCTION_ACCEPTANCE_EMAIL`
account, never guessed). A name-only match is downgraded to **ambiguous**
and is never proposed for reclassification — it requires manual review.
Nothing in this function or its caller mutates any row.

`scripts/dry-run-legacy-fixture-classification.ts` wraps this with real
(read-only) `OwnerBusiness`/`User` queries and prints a report: confident
candidates, ambiguous rows, and `PRODUCTION_DATA_MUTATIONS: 0`. It contains
no `.create`/`.update`/`.delete` call anywhere. It was **not run against the
real production database in this session** — this sandboxed environment has
no network path to production Postgres, so `EXISTING_FIXTURE_DRY_RUN_COUNT`
and `AMBIGUOUS_ROW_COUNT` are unknown until someone with production DB
access runs it. Unit tests for the classification logic itself
(`src/__tests__/domain/founder-recovery/legacy-fixture-classification.test.ts`)
do run in this session and pass, proving the fail-closed behavior (ambiguous
rows never promoted to confident, no known actor email ⇒ everything
ambiguous, a real business's name is never matched).
Reclassifying the confident candidates the dry run reports remains a
separate, explicitly-authorized action — out of scope here.

## What's already closed

- `CROSS_TENANT_LEAK`: no — every business list/read is scoped by the
  server-derived `workspaceId` (verified by a repo-wide grep for
  `ownerBusiness.findMany`/`findUnique`; `listBusinesses`/`getBusiness` in
  `src/services/founder-recovery/business.service.ts` are the only call
  sites in production code).
- `ARCHIVED_VISIBILITY`: fixed. `OwnerBusiness.isActive` already existed
  with a fully governed, capability-gated PATCH endpoint
  (`PATCH /api/owner/recovery/businesses/[id]`, `updateBusiness`) that can
  set it `false`, but `listBusinesses()` never filtered on it. One-line fix
  closed this with no migration. Verified live this session: created a
  test business, archived it via the existing endpoint, confirmed it no
  longer appears in `GET /api/owner/businesses`.

## What's still open: ACTIVE acceptance fixtures

An acceptance/QA tester using the real signup flow against a shared
acceptance account creates real, **active** `OwnerBusiness` rows there is
currently no way to distinguish from a real owner's businesses except by
name. Archiving (above) is a manual, per-business owner action — it does
not prevent new fixture rows from looking identical to real ones the
moment they're created, and there is no bulk/administrative way to find
and clean them up.

## Proposed architecture: `isFixtureBusiness`

Mirrors the pattern `Workspace.signupSource` already establishes for
distinguishing public-beta signups (`"PUBLIC_BETA"` vs `null`) — an
additive, nullable provenance marker, not a new subsystem.

1. **Schema** (additive, zero-risk migration): add
   `isFixtureBusiness Boolean @default(false)` to `OwnerBusiness`. Every
   existing row defaults to `false` (real); no backfill, no data movement.
2. **Set it at creation time**, not after the fact. `createBusiness()`
   (`business.service.ts`) already takes `workspaceId`; extend it to also
   read the calling workspace's `signupSource` and set
   `isFixtureBusiness: workspace.signupSource === "ACCEPTANCE_TEST"` (a new
   `signupSource` value, reusing the existing column) — this requires the
   acceptance/QA account's workspace to itself be tagged once, not each
   business it creates. Alternative if acceptance testing does not use a
   single dedicated workspace: an explicit, capability-gated request field
   (e.g. `SYSTEM_ADMIN`-only `{ isFixtureBusiness: true }` on the create
   call), so only an authorized QA actor can mark a row as a fixture — a
   self-serve owner can never set this on their own business.
3. **Filter it the same way `isActive` was fixed**: `listBusinesses()`
   adds `isFixtureBusiness: false` to its `where` clause alongside
   `isActive: true`. One more line, same shape as the fix already shipped.
4. **A separate, `SYSTEM_ADMIN`-gated endpoint** (`GET`
   `/api/admin/fixture-businesses` or similar) lists rows where
   `isFixtureBusiness: true` across workspaces, for QA cleanup —
   read-only; deleting/archiving them still goes through the existing
   governed `updateBusiness`/archive path, never a raw delete.

## Why this is a separate, controlled change

- It is a schema migration. Applying it to the production database is a
  deploy-time operation (`prisma migrate deploy`) gated by this repo's own
  exact-SHA merge policy and CI, not something to run ad hoc from a
  session with no production database access to begin with.
- Deciding *how* acceptance testing identifies itself (a dedicated
  workspace vs. a per-request admin flag) is a real product/process
  decision — guessing it would risk either under-marking (fixtures still
  leak through) or over-marking (a real owner's business silently hidden
  from their own list). That decision belongs to whoever runs acceptance
  testing today, not to this session.

`ACTIVE_ACCEPTANCE_FIXTURE_ISOLATION` remains **OPEN** until that decision
is made and the migration above ships through the normal release process.
