# Phase 6C-F2 — create-site inventory (raw-500-create sweep)

**Date:** 2026-07-10 · **Base:** main @ `b91f977`

Repo-wide scan of `db.<model>.create` / `tx.<model>.create` in `src/app/api` + `src/services` (excluding
tests), cross-referenced against Prisma models whose `id` has **no** DB default (so the create must supply
`id`). A create that omits a required no-default field raw-500s with `PrismaClientValidationError`.

**Method note / correction:** the initial idle-audit grep matched `id:` but missed object **shorthand**
`id,` (from a local `const id = randomUUID()`). Re-verifying each block's actual payload reclassified 5
"suspected" owner-budget/finance/recovery sites as FALSE_POSITIVE (they DO supply `id` via shorthand).

## Confirmed & fixed (5)

| # | File / function | Model | id req | updatedAt | Payload defect | Fix | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `services/engagement.ts:createEngagement` | Engagement | yes | required | missing `id`, `updatedAt` | +`id: randomUUID()`, +`updatedAt: new Date()` | **CONFIRMED_HIGH** (probed: "Argument `id` is missing") — core lifecycle: engagements couldn't be created |
| 2 | `app/api/onboarding/invite/route.ts` user create | User | yes | required | missing `id`, `updatedAt` | +`id`, +`updatedAt` | **CONFIRMED_HIGH** — inviting a *new* user raw-500'd |
| 3 | `services/deliverable.ts:createDeliverable` | Deliverable | yes | required | missing `id`, `updatedAt` | +`id`, +`updatedAt` | **CONFIRMED_HIGH** |
| 4 | `services/client-contact.ts` contact create | ClientContact | yes | required | missing `id`, `updatedAt`; phantom `createdBy` (no such column) | +`id`, +`updatedAt`, drop `createdBy` | **CONFIRMED_HIGH** |
| 5 | `services/entitlement.service.ts` usageEvent create | UsageEvent | yes | (no column) | missing `id` | +`id` (no `updatedAt` column) | **CONFIRMED_MEDIUM** (usage metering) |

All 5 proven fixed against real Postgres (see EVIDENCE_LEDGER + test).

## Cleared as FALSE_POSITIVE (10)

| File / function | Model | Why cleared |
|---|---|---|
| `services/founder-recovery/cycle.service.ts:89` recoveryFinding | RecoveryFinding | supplies `id` via shorthand (`const id = randomUUID()`) |
| `services/owner-finance/diagnosis.service.ts:70` ownerFinanceFinding | OwnerFinanceFinding | supplies `id` via shorthand |
| `services/owner-budget/action-link.service.ts:92` ownerBudgetAction | OwnerBudgetAction | supplies `id` via shorthand |
| `services/owner-budget/working-capital.service.ts:44` | OwnerWorkingCapitalItem | supplies `id` via shorthand |
| `services/owner-budget/archetype-metrics.service.ts:47` | OwnerArchetypeMetric | supplies `id` via shorthand |
| `services/operator/store.ts` (×2) | OperatorItem | correct `id`+`createdByUserId`+`updatedAt` (prior audit) |
| `services/action.ts:createAction` | Action | correct `id`+`updatedAt` (prior audit) |
| `services/action.ts:561` recommendation.create | Recommendation | model has `@default` id/updatedAt |
| `app/api/owner/dashboard/route.ts:70` | (DTO) | response-DTO field, not a create |
| `services/execution/action-handlers.ts:210` | Action | **commented-out example code** (COMMENTED_EXAMPLE) |

## Already fixed in prior phases (DUPLICATE_ALREADY_TRACKED)

| File | Phase |
|---|---|
| `services/decisions/decision-creation-service.ts` createDecision | Phase 6C Wave 1 (PR #212) |
| `app/api/decisions/intake/route.ts` | Phase 6C-F1 (PR #213) |

## Net

The systemic raw-500-create class comprised **7** owner-facing create sites: decisions ×2 (fixed in
#212/#213) and the **5 fixed here**. No other create site in the scanned surface omits a required no-default
field. No Prisma schema change was needed — every case was a wrong/incomplete create payload.
