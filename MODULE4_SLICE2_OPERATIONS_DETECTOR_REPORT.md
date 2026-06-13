# Module 4 (Operations & Productivity Intelligence) — Slice 2: Detector — Report

Status: **COMPLETE — built and locally verified.** Pure deterministic detector
(no DB / API / UI / LLM). Maps Slice 1 metrics → Spine `OwnerFinding[]` + an
operations `DomainScore` (domain `operations`). Module 1 + Module 2 + Module 3 +
Module 5 untouched. No Prisma/migration change. No public/SaaS.

## 1. Files created / changed

- `src/domain/owner-operations/risk-rules.ts` — `buildOperationsRiskFindings` (new).
- `src/domain/owner-operations/opportunity-rules.ts` —
  `buildOperationsOpportunityFindings` (new).
- `src/domain/owner-operations/diagnosis.ts` — `diagnoseOperationsSnapshot`,
  `rankOperationsFindings`, operations `DomainScore` (new).
- `src/domain/owner-operations/index.ts` — export detector + diagnosis (changed).
- `src/__tests__/owner-operations/diagnosis.test.ts` — 10 tests (new).

## 2. Risk findings (execution.md §11.3)

Emit ONLY when the metric is computable and crosses its threshold:

- `OPS_CAPACITY_BOTTLENECK` — utilization bands (over-capacity critical / strained);
  also covers the equipment-constraint signal.
- `OPS_LOW_COMPLETION` — completion-rate bands (critical/low).
- `OPS_HIGH_DELAY` — delay-rate bands (critical/high).
- `OPS_HIGH_REWORK` — rework-rate bands (critical/high).
- `OPS_HIGH_COMPLAINT_RATE` — complaints relative to completed orders.
- `OPS_DELIVERY_FAILURE` — delivery-success bands (critical/low).
- `OPS_SOP_NONCOMPLIANCE` — SOP-compliance bands (critical/low).
- `OPS_HIGH_IDLE` — staff idle share (productivity signal).
- `OPS_INVENTORY_SHORTAGE` — stockout events constraining work.
- `OPS_MISSING_CRITICAL_DATA` / `OPS_INVALID_CURRENCY` — certain (confidence 1).

## 3. Opportunity findings (execution.md §11.4 / spec §5)

Emit ONLY when supporting inputs exist: `OPS_OPP_RECOVER_DELAYS`,
`OPS_OPP_CUT_REWORK`, `OPS_OPP_RECLAIM_IDLE`, `OPS_OPP_CLOSE_SOP_GAP`,
`OPS_OPP_USE_CAPACITY_HEADROOM` (only when below the strain bar),
`OPS_OPP_DATA_QUALITY`.

## 4. Honesty guarantees

- Metric-derived findings carry data-confidence as their confidence; data/currency
  findings are certain.
- No opportunity fabricated when its input is absent; capacity-headroom opportunity
  is suppressed when over the strain bar (test-proven).
- Every finding validates against the Spine `ownerFindingSchema` with
  `domain: "operations"`; the `DomainScore` validates against `domainScoreSchema`
  and mirrors the engine's health/risk/opportunity/confidence exactly.
- Deterministic ranking (severity → impact → urgency → confidence → code); pure
  (no input mutation; identical order across runs) — test-proven.
- Operations is an EXECUTION domain — its `riskScore` will feed the command
  center's `executionRiskScore`.

## 5. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-operations/` | 26 passed (16 engine + 10 detector) |
| `npm run build` | Compiled successfully |
| `npx eslint src/domain/owner-operations src/__tests__/owner-operations` | clean |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 / 1153 — no increase) |
| `npm test` | full suite — see status (0 failed) |

## 6. Scope / next slice

No planner, persistence, migration, API, UI, or condition/command-center wiring
yet — Slices 3–8. **No gate reached** (pure detector); the next slice is Slice 3 —
the operations recommendation/action planner. Persistence + migration (Slice 4) is
the first manual stop.
