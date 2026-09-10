# Production Fixture Backfill Plan (P0-A)

Status: **PROPOSED — NOT EXECUTED.** No production database was accessed, queried, or
mutated in producing this plan or the beta-usability-hardening PR it belongs to.
`PRODUCTION_MUTATIONS = 0`.

## Why this plan exists

The Money page business switcher exposes ~36 businesses to an ordinary owner, including
records such as "OPSIQ Acceptance - Recovery - ...", "OPSIQ Production Acceptance -
<ISO timestamp>", etc. Root-cause investigation (this PR) confirmed:

- The read path (`listBusinesses()` in `src/services/founder-recovery/business.service.ts`)
  **already** filters `isFixtureBusiness: false` correctly — this is not a missing-filter bug.
- The exposed rows are **historical**: they were created before the `isFixtureBusiness` column
  existed. Its migration (`prisma/migrations/20260908042043_add_owner_business_fixture_flag/
  migration.sql`) is additive (`NOT NULL DEFAULT false`) with **no backfill**, so every
  pre-existing acceptance/fixture business — real or not — defaulted to `isFixtureBusiness =
  false` and is indistinguishable from a genuine owner business by that column alone.
- This is a known, previously-documented, still-open condition — see
  `docs/opsiq-governance/ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md`, "Historical rows still in
  production" (~35+ rows, not retroactively reclassified without explicit owner authorization).

Correcting these rows requires a one-time, explicitly-authorized backfill. This document is
that plan. It does not execute anything.

## Exact rows affected

Not yet enumerated — no production DB access exists in this session (or in this PR generally;
per the mission's PRODUCTION SAFETY constraints, none was attempted). The eligibility rule and
dry-run tooling below are how the exact row set is determined, on demand, by whoever holds
production access and explicit owner authorization to run it. The live finding (~36 exposed
businesses) and the prior governance doc's estimate (~35+) are consistent, non-authoritative
upper-bound signals, not a verified row list.

## Eligibility rule (deterministic, fail-closed, already built — not yet run against production)

Implemented in `src/domain/founder-recovery/legacy-fixture-classification.ts`
(`classifyLegacyFixtureCandidates()`), covered by
`src/__tests__/domain/founder-recovery/legacy-fixture-classification.test.ts`. A row is only
proposed as a confident candidate when **both** independent signals agree:

1. **Name signal** — `OwnerBusiness.name` matches `^OPSIQ (Production )?Acceptance\b`
   (case-insensitive, anchored at the start, so a real business that merely mentions
   "acceptance" elsewhere in its name — e.g. "Client Acceptance Corp" — never matches).
2. **Actor signal** — `OwnerBusiness.createdBy` resolves to a user whose email is in the known
   acceptance-actor allowlist (`PRODUCTION_ACCEPTANCE_EMAIL` /
   `LEGACY_FIXTURE_KNOWN_ACTOR_EMAILS`).

A name-only match without a confirmed actor is classified **ambiguous** and is never proposed
for reclassification — it requires manual review, not automatic action. Rows already tagged
`isFixtureBusiness: true` are excluded (nothing left to classify).

This deliberately rules out the alternative of inferring fixture status from the name alone at
runtime (forbidden by this PR's own instructions, and by the existing governance doc) — the
name is a *candidate* signal for an explicitly-authorized backfill, never a live filtering rule.

## Dry-run query (read-only, already built, zero writes)

`scripts/dry-run-legacy-fixture-classification.ts` — performs only `findMany` reads (no
`.update`/`.create`/`.delete` anywhere in the file). Usage:

```
DATABASE_URL=<production, read access sufficient> \
PRODUCTION_ACCEPTANCE_EMAIL=<the real acceptance account email> \
  npx tsx scripts/dry-run-legacy-fixture-classification.ts --json
```

Output is a report of `{ confidentFixtureIds, ambiguousIds }` (with each row's id, name,
workspaceId) and always states `PRODUCTION_DATA_MUTATIONS: 0`. Without a configured
`PRODUCTION_ACCEPTANCE_EMAIL`, every name-matching row reports as ambiguous — the tool's
fail-closed default, not an error.

**This dry run has not been executed against production in this session or this PR.** Running
it is the first, safe, read-only step toward executing this plan, and may be done independent
of (and prior to) any decision to proceed with the write step below.

## Backfill write step (NOT built, NOT executed — requires separate authorization)

Only after: (a) the dry-run report above is reviewed by the business owner, and (b) explicit
written authorization is given naming which specific row ids (from the `confidentFixtureIds`
list only — never the ambiguous list) are approved for reclassification:

- Set `isFixtureBusiness = true` on exactly those authorized rows via the existing governed
  `updateBusiness()` path (or an equivalent one-time script gated the same way), never a raw
  bulk SQL `UPDATE`.
- Emit an audit event for each row changed (per this repo's "all meaningful mutations must
  emit audit events" rule), recording: row id, previous value, new value, actor, authorization
  reference (e.g. the owner's written approval / ticket).
- Do not touch any other field on the row (name, workspaceId, isActive, etc.) — this is a
  provenance-flag correction only, not a general edit.
- Do not delete any row. Fixture businesses stay reachable via the existing governed
  `listFixtureBusinesses()` path for SYSTEM_ADMIN/acceptance tooling; they are simply no longer
  shown to the ordinary owner whose workspace they were created under.

## Rollback strategy

- The change is a single boolean flip per row (`isFixtureBusiness: false → true`), recorded in
  `audit_log` with the previous value. Rollback is the same governed write, reversed
  (`true → false`), for any row id where reclassification is later found to be wrong — driven
  from the audit trail, never a blind re-run of the classifier (which is why the audit event
  above must record the previous value per row).
- No cascading data is touched (no related records are created, deleted, or reassigned by this
  flag), so rollback carries no secondary cleanup.

## Owner authorization requirement

Per this repository's destructive-operation and exact-SHA merge policy: a production data
mutation — this backfill included — requires explicit written owner authorization naming the
specific rows (or the dry-run report they were selected from) before any write executes. This
PR performs no such write and requests no such authorization on its own initiative; it only
delivers the tooling and this plan so that a future, explicitly-authorized session can execute
it safely. Granting the acceptance/QA account `SYSTEM_ADMIN` in production (so its own
already-correct `isFixtureBusiness: true` tagging on *new* rows actually takes effect — see
`ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md`, "Rollout to production") is a separate, smaller
production change with the same authorization requirement, and should be resolved independent
of whether/when this backfill executes, since it prevents the historical-row count from growing
further regardless.

## Explicitly out of scope for this plan

Executing the dry run, executing the write step, deploying the `isFixtureBusiness` migration to
production if not already live, and granting `SYSTEM_ADMIN` to the acceptance account are all
out of scope for the beta-usability-hardening PR this plan accompanies. `PRODUCTION_MUTATIONS =
0` for that PR; this document is process/tooling only.
