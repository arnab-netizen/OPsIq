# Synthetic-Realistic Owner Dry Run — Runbook

## Prerequisites
- Node + repo deps installed (`npm ci`).
- No database required: the readiness assessor and governed diagnosis are pure.

## Steps

1. **Readiness (fail-closed)** — confirms every mandatory input is present and
   non-empty; numeric `0` is valid, blanks are not.
   ```
   npx tsx scripts/owner-data-dry-run.ts owner-data-dry-run/laundry.synthetic-realistic.json
   npx tsx scripts/owner-data-dry-run.ts owner-data-dry-run/housekeeping-distressed.synthetic-realistic.json
   ```
   Capture: exit code, READY/BLOCKED, completeness %, missing data.

2. **Readiness + governed diagnosis**
   ```
   npx tsx scripts/synthetic-owner-dry-run.ts owner-data-dry-run/laundry.synthetic-realistic.json
   npx tsx scripts/synthetic-owner-dry-run.ts owner-data-dry-run/housekeeping-distressed.synthetic-realistic.json
   ```
   Capture: data mode, readiness, progression stage + expansion decision + growth
   class + blocked reasons, SOP-modernization recommendations, client
   recovery/retention recommendations, learning-write-allowed (must be `false`),
   required workflows.

3. **Tests**
   ```
   npx tsc --noEmit
   npx vitest run src/__tests__/domain/execution/synthetic-realistic-dry-run.test.ts
   npx vitest run src/__tests__/domain/execution/owner-data-dry-run.test.ts
   npx prisma validate
   ```

## What to do on BLOCKED
- If BLOCKED for a **missing mandatory field**, patch the dataset with a
  realistic value and re-run. Never fabricate a value just to flip to READY.
- If BLOCKED for a **valid reason that should stay blocked** (e.g. you genuinely
  removed a required section), report it honestly — that is correct behavior.

## Honesty checklist (must all hold)
- [ ] Data is labelled `SYNTHETIC_REALISTIC` / `NOT_REAL_OWNER_DATA`.
- [ ] No synthetic outcome is written to verified learning.
- [ ] No claim of actual business improvement, real employee performance, or real
      client churn proof.
- [ ] Every recommendation is owner-review-required.
- [ ] Housekeeping (distressed) expansion stays BLOCKED.
