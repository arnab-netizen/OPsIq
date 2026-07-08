# Phase 1 Wave 8 — Owner-Journey E2E Proof PLAN (Final Report) — FINAL WAVE

Produce the owner-journey E2E proof **PLAN**: a coverage matrix mapping the owner journey to the four
mandated dimensions and to the existing proof surfaces, plus **one minimal seam** so a later
(owner-authorised) full-Playwright wave requires no rewrite. **NOT full Playwright.** No feature build, no
test reactivation, no test deletion, no assertion weakening. Per the owner controlling loop, execution
**STOPS after this wave**.

## 1. Previous PR (Wave 7 #190) merge summary
Wave 7 (diagnostic uncertainty / fail-closed proof) merged into `main` — merge commit
`16d321d328c80613219eb5a1dcf151f639bfa762`. The required `CI - Build & Test` run (`28937541005`,
`TEST_WITH_DB=true`) completed **success**, including step 15 "Run maintained test suite" — the reactivated
pure-unit `control/recommendation.test.ts` (22 blocks) ran and passed. `mergeable_state` was `unstable`
(non-required scenario/browser OOM packs), not `blocked`.

## 2. Post-merge main verification (Wave 7)
Confirmed GREEN (structural): main HEAD `16d321d3`; merge commit in ancestry; clean tree; all reactivated
tests present (Wave-1 ×4, Wave-2 ×2, Wave-3 ×1, Wave-4 ×1, Wave-5 ×1, Wave-6 ×1, Wave-7 ×1); quarantine 86.
This Wave-8 branch is cut from `16d321d3`.

## 3. Wave-8 branch and HEAD
- Branch: `claude/phase-1-wave-8-owner-journey-proof-plan`
- HEAD before: `main` (`16d321d3`). HEAD after commit: see final response.

## 4. Nature of this wave (why it is a plan, not a reactivation)
The owner loop scopes Wave 8 to "owner-journey E2E proof PLAN + coverage matrix + minimal seams only — NOT
full Playwright", and to STOP after it. Inventory shows **no quarantined E2E tests to reactivate**: full
owner-journey Playwright already exists under `tests/browser/` (21 `owner-*` specs +
`owner-realistic-baseline.spec.ts` + `owner-pilot-fixtures.ts`) and `e2e/auth-flow.spec.ts`, driven by
`playwright.config.ts`. These run in the **non-required** browser lane (also the `next build` heap-OOM-prone
lane). Wave 8 therefore delivers the plan + matrix + one inert seam, and reactivates nothing.

## 5. Deliverables
1. **`OWNER_JOURNEY_COVERAGE_MATRIX.md`** — a 12-stage owner journey (entry → steady-state governance),
   each stage mapped to the four mandated dimensions and to the existing spec(s) that prove it, with 5
   documented gaps (G1–G5) owed to a future full-Playwright wave.
2. **`tests/browser/owner-journey-map.ts`** — THE minimal seam: a typed manifest
   (`OwnerJourneyDimension`, `OwnerJourneyProofState`, `OwnerJourneyStage`, `OWNER_JOURNEY_STAGES`,
   `OWNER_JOURNEY_OPEN_GAPS`). Pure types + data, **no imports, no product/business logic**, not a
   `*.spec.ts`/`*.test.ts`. A future wave imports it to organise/drive E2E coverage with no rewrite.
3. **`EVIDENCE_LEDGER.json`** — machine-readable record of the above.

## 6. The four dimensions, covered across the journey
Every stage is mapped against: (1) consulting lifecycle stage, (2) business condition, (3) intervention mode
+ phase, (4) human execution reality. The steady-state stage (12) carries all four; the matrix shows the
full distribution. Human-factors are modelled as business-operational variables only (no mental-health /
personality modelling), per CLAUDE.md.

## 7. Documented proof gaps (owed to the future full-Playwright wave)
- **G1** diagnosis fail-closed end-to-end (confident diagnosis **blocked**, not merely "low", on
  insufficient/contradictory evidence — ties Wave-7).
- **G2** recommendation deterministic priority ordering end-to-end (ties Wave-3/4).
- **G3** weekly KPI-deterioration → governed re-evaluation of condition/mode/phase + review cadence.
- **G4** shock event → adaptive re-evaluation of `BusinessConditionProfile` + `InterventionMode`/`Phase` +
  priority + review cadence.
- **G5** promote a minimal, memory-stable owner-journey smoke into a **required** lane (owner proof is
  currently non-required and OOM-prone).

## 8. Seam safety (no CI risk)
`tests/**` is **excluded from the whole-project `tsc` gate** (verified in `tsconfig.json`), the seam is not a
`*.spec.ts`/`*.test.ts`, and no spec imports it yet — so it is **inert in every CI lane** (required
`build-and-test` and non-required browser). It is pure types + `const` data with zero imports and zero
product/DB coupling. Adding it cannot change product behaviour or break a gate.

## 9. Defects found
**None.** No product/source/test defect. This wave changes no executable behaviour.

## 10. Fixes made
**None.** No product/source/schema/CI/test change.

## 11. Files changed
- Added: `tests/browser/owner-journey-map.ts` (inert typed seam).
- Added: `docs/audits/2026-07-08-phase-1-wave-8-owner-journey-proof-plan/{FINAL_REPORT.md,
  OWNER_JOURNEY_COVERAGE_MATRIX.md,EVIDENCE_LEDGER.json}`.
- No product/source/schema/CI files. No Phase-0/Wave-1..7 file touched. No test reactivated/changed.

## 12. Commands run
`git checkout -B claude/phase-1-wave-8-owner-journey-proof-plan main`; inventory owner-journey E2E surfaces
(`tests/browser` `owner-*`, `e2e/`, `playwright.config.ts`) and quarantined E2E candidates (none); verify
`tsconfig` excludes `tests/**`; author the seam + matrix + report; verify all 27 referenced spec paths
exist; JSON validation; `[ -d node_modules ]` → NO.

## 13. Pass / fail / deferred status
| Gate | Status |
|---|---|
| Plan completeness (12 stages, 4 dimensions, 5 gaps, all specs verified) | **PASS** |
| Seam is inert & safe (under excluded `tests/**`; not a spec/test; no imports) | **PASS** |
| typecheck (tsc) | **N/A** (seam under excluded `tests/**`; docs non-code); whole-project tsc **BLOCKED** locally → PR CI |
| lint | **BLOCKED** locally → PR CI |
| vitest maintained suite | **No test added/changed** — expected no-op; **DEFERRED to PR CI** |
| full Playwright owner-journey | **NOT BUILT / NOT RUN — explicit STOP after Wave 8** |

## 14. Remaining risks
1. Owner-journey end-to-end proof still lives only in the non-required, OOM-prone browser lane (G5). This
   is documented, not resolved — resolving it is the future full-Playwright wave's job.
2. G1–G4 assertions are specified but not yet implemented (by design — Wave 8 is the plan).
3. 86 tests remain quarantined overall (unchanged; Wave 8 reactivates none).

## 15. Rollback plan
One commit: 1 inert seam + 2 plan docs (+ this ledger). `git revert` restores prior state. No
product/source/schema/CI change, no test change → clean, immediate.

## 16. Exact next recommended phase
**STOP.** Per the owner controlling loop, execution halts after Wave 8 is merged and main is verified. The
full Playwright build-out closing gaps G1–G5 (including promoting a minimal owner-journey smoke into a
required, memory-stable lane) is the natural next phase but is **NOT** started without a new owner
instruction.

## Product logic changed
**No.** One inert typed seam (`tests/browser/owner-journey-map.ts`, pure types + data, no imports, not
executed by any lane) + plan docs. No product source, schema, CI, prior-wave, or test file changed. No test
reactivated, deleted, or weakened; quarantine unchanged at 86.
