# OpsIQ Runtime-Readiness — P0-B Intake Materialization Report

> Second P0 slice. Objective: close blocker **B2** — the CSV intake dead-end, where confirming an upload only flipped
> `ownerConfirmed=true` and its numbers never reached the snapshot read models the owner plan / diagnosis consume, so
> "OpsIQ is ready to analyze" was false. This slice materializes confirmed intake into real snapshots. Minimum-code,
> one slice per PR. No gate weakened; no fabricated data; no duplicate engine; no public-SaaS/billing/integration work.

## Branch & base
- Branch: `claude/runtime-readiness-p0b-intake-materialization`
- Base HEAD: `bfa427a2` (main; post-corpus prep #77). Independent of P0-A (uses services, not P0-A's routes).

## What was implemented
- NEW `src/services/owner-intake/materialize.ts` — `materializeIntake(intake, actorId)` converts a confirmed intake's
  normalized records into the domain's real snapshot rows via the EXISTING persistence service. Scope this slice:
  `finance` → `OwnerFinancialSnapshot` (feeds the plan's `finance_cash` + `margin_pricing` critical domains). Other
  intake domains (sales/operations/marketing/sop) are recognised and reported as `materialized: 0` so the dispatch
  extends without a rewrite.
- CHANGED `src/services/owner-intake/intake.service.ts` — `confirmDataIntake` now calls `materializeIntake` after the
  atomic confirm and returns a `materialization: { materialized, skipped }` summary; the confirm audit event carries
  the counts.

### Fail-closed by construction (cannot fake readiness)
- Only records with ALL required fields (`periodStart`, `periodEnd`, `currency`, `revenue`) materialize; incomplete
  records are skipped. A confirm whose records lack the required fields materializes **0** → the plan still resolves
  `need_more_data`. Readiness is never faked.
- Period duplicates are **idempotent**: `createFinancialSnapshot` throws `ConflictError` on an existing period, which
  materialization treats as a skip — it never overwrites a governed record.
- Workspace/business ownership is enforced inside `createFinancialSnapshot` (`getBusiness`), so a cross-workspace
  confirm is rejected.

## Files changed
- NEW `src/services/owner-intake/materialize.ts`
- CHANGED `src/services/owner-intake/intake.service.ts` (wire materialization into confirm)
- NEW `src/__tests__/api/owner/intake/intake-materialization.db.test.ts` (4 DB tests)
- NEW `OPSIQ_RUNTIME_READINESS_P0B_INTAKE_MATERIALIZATION_REPORT.md`

## DB / migration changes
**None.** Materializes into the existing `OwnerFinancialSnapshot` table via the existing service.

## API changes
No new route; `POST /api/owner/intake/uploads/[intakeId]/confirm` now additionally materializes on confirm and returns
the materialization summary (additive to the JSON response).

## UI changes
**None in this slice.** The intake page copy ("OpsIQ is now ready to analyze") becomes truthful for `finance`; broader
intake/manual-entry UI + browser proof remain the next step.

## Tests / checks run (local)
- P0-B materialization DB tests (Postgres 16): **4/4 pass** — valid finance intake → real snapshot the plan reads
  (`realProviderDomains` contains `finance_cash`); intake missing required fields → **0 materialized, snapshot count 0,
  finance_cash NOT present** (no faked readiness); duplicate periods → 1 materialized / 1 skipped (idempotent);
  cross-workspace confirm rejected.
- No-regression: `tsc --noEmit` ✓ · eslint(changed files) 0/0 ✓ · lint:ratchet PASS (2155=2155) · existing intake
  suites **55 tests pass** · owner-finance + services/owner-mode **135 tests pass**. Browser/mobile lanes unchanged.

## Honest scope note (not overclaimed)
- Materializes the `finance` domain only. `sales`/`operations`/`marketing`/`sop` intake domains are recognised but not
  yet materialized (reported as 0) — a later slice extends the dispatch to `cashflow`/operations snapshots.
- Owner-facing intake/manual-entry UI + browser/mobile proof are not in this slice.

## Classification
**`P0_CSV_MATERIALIZATION_READY`** — confirmed CSV intake now materializes into the snapshot read models the owner plan
consumes (for `finance`), fail-closed and idempotent, DB-proven. Combined with P0-A (`P0_CRITICAL_DOMAIN_WRITES_READY`),
the P0 ingestion path is substantially unblocked at the data layer. NOT yet `P0_REAL_BUSINESS_INGESTION_UNBLOCKED`
(that additionally requires owner UI + browser/mobile proof + the remaining intake domains).

## Merge recommendation
Open PR; **do not merge** until CI is green (incl. a CI DB run of the new `.db.test.ts`) and a final hostile re-read.
Sequence: land P0-A (#78) and P0-B, then the intake-UI/browser slice to reach `P0_REAL_BUSINESS_INGESTION_UNBLOCKED`,
then P1 (proof loop). Public SaaS / billing / launch / integrations remain blocked.
