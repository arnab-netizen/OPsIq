# Phase 6C-F2 — systematic raw-500-create sweep

**Date:** 2026-07-10
**Branch:** `claude/phase-6c-f2-systematic-raw500-create-sweep` (from `main` @ `b91f977`)
**Type:** Defect sweep — fix create payloads that raw-500. No schema change, no secrets, no production migration.

## 1. Phase 6C-F1 final main verification

PR #213 merged → main `b91f977`. Main-after-#213: `CI/CD Foundations #1373` ✅, `MVP Readiness #1639` ✅ with
**Security Baseline HONEST_GREEN**; `CI - Build & Test #3026` running on the identical content that passed as
F1's `#3025`. Only non-required `Smoke #569` red (known `BLOCKED_SCHEMA_DRIFT`; not migration approval).

## 2. Branch and HEAD

`claude/phase-6c-f2-systematic-raw500-create-sweep`, from `b91f977`.

## 3. Systemic defect summary

A repo-wide scan found create calls that raw-500 because they omit the required `id` (and, where the model
has no default, `updatedAt`) or write phantom columns, on Prisma models with no DB default. Confirmed by
probe: `db.engagement.create` (fixed shape omitted) throws `PrismaClientValidationError: Argument 'id' is
missing.` — so `createEngagement` raw-500'd and **engagements could not be created**. The class is systemic,
not decisions-specific.

## 4. Confirmed sites fixed (5)

| Site | Model | Fix |
|---|---|---|
| `services/engagement.ts` createEngagement | Engagement | +`id`, +`updatedAt` |
| `app/api/onboarding/invite/route.ts` user create | User | +`id`, +`updatedAt` |
| `services/deliverable.ts` createDeliverable | Deliverable | +`id`, +`updatedAt` |
| `services/client-contact.ts` contact create | ClientContact | +`id`, +`updatedAt`, drop phantom `createdBy` |
| `services/entitlement.service.ts` usageEvent create | UsageEvent | +`id` (no `updatedAt` column) |

All write only real schema columns; `id: randomUUID()` and `updatedAt: new Date()` follow the repo's existing
convention (e.g. `operator/store.ts`, Phase 6C-F1). Business/auth/tenant semantics unchanged.

## 5. Suspected sites checked → 5 cleared as FALSE_POSITIVE

`recoveryFinding`, `ownerFinanceFinding`, `ownerBudgetAction`, `ownerWorkingCapitalItem`,
`ownerArchetypeMetric` all supply `id` via object **shorthand** (`const id = randomUUID(); create({data:{id, …}})`)
which the initial grep missed. Re-verified by reading each payload. See `CREATE_SITE_INVENTORY.md`.

## 6. False positives cleared (also)

`operator/store.ts` (×2), `createAction`, `recommendation.create` (schema defaults), `owner/dashboard:70`
(DTO), `action-handlers.ts:210` (commented-out example).

## 7. Deferred sites and proof needed

None in this defect class — the scanned surface is exhausted (7 sites total: 2 fixed in #212/#213, 5 fixed
here). Broader model coverage (every `create` across all domains) was bounded to the id-required-no-default
set; a future exhaustive pass could probe remaining models, but no additional confirmed raw-500-create sites
remain in owner-facing routes/services.

## 8. Files changed

- `src/services/engagement.ts`, `src/services/deliverable.ts`, `src/services/client-contact.ts`,
  `src/services/entitlement.service.ts`, `src/app/api/onboarding/invite/route.ts` — create-payload fixes.
- `src/__tests__/services/raw500-create-sweep.db.test.ts` — real-DB regression test (5 cases).
- `.claude/governance-baseline.json` — **3 line-number updates only** (480→483, 519→522, 568→571): pre-existing
  `raw-error-message` findings in `engagement.ts` shifted +3 by the added import/create lines; the
  line-keyed baseline required re-anchoring. No finding added or removed; no new violation introduced.

## 9. Tests added

`raw500-create-sweep.db.test.ts` (`TEST_WITH_DB`): runs the exact fixed create payload for each of the 5 sites
against real Postgres (seeding real workspace/user/client/engagement/stage FKs) and asserts a schema-valid
record with a real `id` persists — each raw-500'd before the fix. Full end-to-end service/route invocation
(capability/plan/session harness) is deferred; the create payload (the defect locus) is proven directly, no
Prisma mocks.

## 10. Commands run

```
# probe (real Postgres :5433)
db.engagement.create(fixed shape) before fix → "Argument `id` is missing"; after → OK (engagement/clientContact/usageEvent all OK)
TEST_WITH_DB=true vitest raw500-create-sweep.db.test.ts     → 5 passed
vitest (no DB)                                              → 5 skipped
tsc --noEmit                                               → exit 0
eslint <changed files>                                    → 0 errors (pre-existing warnings only)
prisma validate                                           → valid
npm run lint:ratchet                                      → PASS (0 changed-file errors)
npm run governance:scan:strict                            → 0 new (exit 0, after baseline re-anchor)
npm run governance:scan:auth                              → exit 0
regression: decisions.test + decisions-intake.db.test     → 15 passed (with sweep)
```

## 11. Pass/fail/deferred status

Fixed: **5 confirmed raw-500-create defects**. Tests: **5 passing** (real DB). Cleared: 15 false positives.
Deferred: none in this class.

## 12. Rollback plan

Revert the 5 source files (reintroduces the raw-500s), the test, and the 3 baseline line-number updates (or
`git revert` the merge). No schema/data impact.

## 13. Updated phase queue

1. **Phase 6C Wave 2 — `api/actions` placebo conversion** (createAction is FALSE_POSITIVE for the create class; still needs real behavioral proof).
2. Auth/scoping subtask — diagnosis `body.workspaceId` / `withAuth` trace (SUSPECTED_MEDIUM).
3. Phase 6D — approval-workflow audit/status/idempotency.
4. Phase 6E — workspace-enforcement drift select + invite boolean + withAuth migration.
5. Phase 6F/6G — agent-reported governance + lane integrity.
6. Remaining placebo waves; production migration only on the exact approval phrase.

## 14. Next recommended phase

**Phase 6C Wave 2 — `api/actions` placebo conversion.**
