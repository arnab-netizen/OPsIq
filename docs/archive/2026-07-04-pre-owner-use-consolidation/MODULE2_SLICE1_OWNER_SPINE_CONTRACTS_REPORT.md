# Module 2 — Slice 1 — Owner Intelligence Spine Contracts — Report

Status: **Slice 1 COMPLETE (TypeScript-only).** No DB/schema/API/UI/migration.
Module 1 behavior unchanged. Public/SaaS frozen.

## 1. Files created

- `src/domain/owner-spine/contracts.ts` — shared cross-domain contracts + pure
  deterministic helpers (no DB/API/UI/LLM/I/O).
- `src/__tests__/owner-spine/contracts.test.ts` — 23 unit tests (pure, no DB).
- `MODULE2_SLICE1_OWNER_SPINE_CONTRACTS_REPORT.md` — this report.

## 2. Contracts created

Enums/vocabularies: `OWNER_DOMAINS` (recovery, finance, cashflow, sales, operations,
customer, marketing, sop, strategy, portfolio), `OWNER_SEVERITIES` (= Module 1
`Severity`), `OWNER_ACTION_STATUSES` (**reuses** `RECOVERY_ACTION_STATUSES`),
`OWNER_VERIFICATION_STATUSES` (= Module 1 `VerificationStatus`), `TARGET_DIRECTIONS`,
plus `SURVIVAL_DOMAINS` / `EXECUTION_DOMAINS` helper sets.

Zod schemas + inferred types (repo style, `zod/v4`): `OwnerFinding`, `OwnerAction`,
`OwnerVerification`, `DomainScore`, `BusinessConditionProfile`.

Deterministic helpers: `clampScore`, `clampConfidence`, `calculateOwnerPriorityScore`,
`rankOwnerActions`, `buildBusinessConditionProfile`.

All score fields are bounded `0..100`; confidence `0..1`; `findingType` is
`risk|opportunity`; `missingData`/`evidence` are string arrays.

## 3. Priority formula

```
priority = clamp01..100(
  impact(0..100) * confidence(0..1)
    * urgencyFactor   (0.5 + urgency/100 + severityBoost)   // severityBoost: low 0, medium .1, high .25, critical .5
    * effortFactor    (1 - 0.6 * effort/100)                // high effort lowers, floor 0.4
    * survivalFactor  (1 + 0.5 * survivalRisk/100)          // high survival risk raises
)
```

Deterministic + explainable + bounded `0..100`, survival-weighted. Higher impact /
urgency / severity / survival-risk → higher priority; higher effort → lower. Missing/
invalid confidence is clamped to 0 (never invented) → priority 0. `rankOwnerActions`
sorts descending priority with a total, order-independent tie-break
(priority → expectedImpact → confidence → findingCode → title), and does not mutate
its input.

## 4. How Module 1 compatibility is preserved

- The spine **imports** `Severity`, `VerificationStatus` (types) and
  `RECOVERY_ACTION_STATUSES` (value) from `founder-recovery` read-only and aligns to
  them; a compile-time check plus runtime tests assert the vocabularies match exactly
  (`OWNER_ACTION_STATUSES === RECOVERY_ACTION_STATUSES`).
- No `founder-recovery` file, recovery table, or recovery contract was modified.
- `npx vitest run src/__tests__/founder-recovery/` → 38 passed (unchanged); full
  suite green.

## 5. Why no DB/schema/API/UI was touched

Per Slice 0 decision and the Slice 1 scope: the spine is TypeScript contracts only,
so future owner modules can emit into shared shapes before any persistence exists.
Finance-specific tables, routes, and UI are later slices (5–7). `prisma/schema.prisma`
is unchanged (`npx prisma validate` valid); no migration; no routes; no pages.

## 6. Test results

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/owner-spine/contracts.test.ts` | **23 passed** |
| `npx eslint` (both new files) | clean (no errors) |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx prisma validate` | valid 🚀 |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped (Module 1 unchanged) |
| `npm run build` | Compiled successfully |
| `npm test` | 194 files passed, **0 failed**; 5496 passed (+23 new) |

Coverage includes: score/confidence clamping (incl. non-finite fail-closed to 0);
priority monotonicity (impact↑, urgency↑, severity↑ raise; effort↑ lowers);
critical-survival outranks low-growth; deterministic stable ranking; profile rollup
(aggregation, recommended next action, missing-data carried + deduped, nothing
invented when empty); Module 1 vocabulary alignment; anti-false-green (scores >100 and
confidence >1 cannot escape — schema rejects + clamp caps).

## 7. Whether Slice 2 can start

**Yes** — Slice 1 is green and isolated. Slice 2 (deterministic finance calculation
engine, pure) may begin under explicit authorization. Not started here.

## 8. Whether public/SaaS remains frozen

**Yes** — frozen. No public/SaaS/billing/marketing files touched.
