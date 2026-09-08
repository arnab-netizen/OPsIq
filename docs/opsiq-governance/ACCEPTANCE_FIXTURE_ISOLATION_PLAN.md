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
