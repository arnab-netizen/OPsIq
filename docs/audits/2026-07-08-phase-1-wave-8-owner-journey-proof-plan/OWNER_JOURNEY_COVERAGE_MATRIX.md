# Owner-Journey E2E Coverage Matrix — Phase 1 Wave 8 (PLAN, not full Playwright)

- Branch: `claude/phase-1-wave-8-owner-journey-proof-plan` · Base: `origin/main` (post-Wave-7, `16d321d3`)
- Date: 2026-07-08
- Deliverable: this coverage matrix + `FINAL_REPORT.md` + `EVIDENCE_LEDGER.json` + **one minimal seam**
  (`tests/browser/owner-journey-map.ts`). **No new full Playwright test, no reactivation.** Quarantine
  unchanged at **86**.

## Scope & guardrails
Per the owner controlling loop, Wave 8 is the owner-journey E2E proof **PLAN**: a coverage matrix + minimal
seams only — **NOT full Playwright** — and the loop **STOPS after Wave 8**. Full owner-journey Playwright
specs already exist under `tests/browser/` (21 `owner-*` specs + `owner-realistic-baseline` +
`owner-pilot-fixtures.ts`) and `e2e/auth-flow.spec.ts`; there are **no quarantined E2E tests to reactivate**.
This wave therefore makes the journey → dimension → existing-spec → gap relationship explicit and
machine-readable for a later (owner-authorised) full-Playwright wave.

## The four mandated dimensions (every stage mapped against these)
1. **consulting lifecycle stage** · 2. **business condition** · 3. **intervention mode + phase** ·
4. **human execution reality** (business-operational only — no mental-health/personality modelling).

## Matrix (owner journey: entry → steady-state governance)

| # | Stage (`id`) | Dimensions | Existing proof surface (spec) | Proof state |
|---|---|---|---|---|
| 1 | Auth & access (`auth-and-access`) | 4 | `e2e/auth-flow.spec.ts`, `07-owner-server-rejection` | covered |
| 2 | Onboarding / intake (`onboarding-intake`) | 1,2,4 | `15-owner-pilot-onboarding`, `21-owner-critical-intake`, `51-owner-manual-entry` | covered |
| 3 | Diagnosis confidence / fail-closed (`diagnosis-confidence`) | 1,2 | `15-owner-pilot-onboarding`, `09-owner-indicators` | **partial gap** |
| 4 | Recommendation priority (`recommendation-priority`) | 2,3 | `46-owner-cockpit`, `13-owner-whole-business-plan` | **partial gap** |
| 5 | Next-best-action / no overload (`next-best-action`) | 3,4 | `47-owner-cockpit-end-to-end-no-overload`, `16-owner-pilot-command-center` | covered |
| 6 | Action execution & commitment (`action-execution-commitment`) | 3,4 | `20-action-status-spectrum`, `16-owner-pilot-command-center` | covered |
| 7 | Adjudication / governance (`adjudication-governance`) | 3,4 | `43-owner-adjudication`, `48-private-owner-shadow-pilot` | covered |
| 8 | Finance / budget safety (`finance-budget-safety`) | 2,3 | `08-owner-finance-budget-safety` | covered |
| 9 | Opportunity loop (`opportunity-loop`) | 1,2,3 | `45-owner-opportunity-loop`, `44-owner-process-intelligence` | covered |
| 10 | Weekly review cadence (`weekly-review-cadence`) | 1,2,3 | `18-owner-supervisor-summary`, `31-weekly-desktop`, `32-weekly-mobile` | **partial gap** |
| 11 | Shock → adaptive re-eval (`shock-adaptive-reeval`) | 2,3,4 | `40-crisis-mobile`, `19-chaos-replay`, `21-chaos-exhaustive-desktop` | **partial gap** |
| 12 | Steady-state governance (`steady-state-governance`) | 1,2,3,4 | `06-owner-control-center`, `50-owner-self-use-readiness`, `17-owner-pilot-mobile`, `12-owner-mobile-smoke`, `owner-realistic-baseline` | **planned gap** |

(The same data is exported, typed and machine-readable, as `OWNER_JOURNEY_STAGES` in the seam file.)

## Documented proof gaps (owed to the future full-Playwright wave)
- **G1 — diagnosis fail-closed end-to-end (stage 3):** onboarding proves weak-business low-confidence +
  missing-data, but a dedicated E2E assertion that a confident diagnosis is **BLOCKED** (not merely "low")
  on contradictory/insufficient evidence is owed. Ties to the Wave-7 `isDataSufficient` fail-closed unit proof.
- **G2 — recommendation priority ordering end-to-end (stage 4):** the cockpit renders recommendations, but
  an explicit deterministic **highest-priority-first ordering** assertion end-to-end is owed. Ties to the
  Wave-3/4 recommendation proofs.
- **G3 — weekly adaptive re-evaluation (stage 10):** an E2E assertion that a significant change (KPI
  deterioration) routes into **governed re-evaluation** of condition/mode/phase + review cadence (the
  CLAUDE.md mandatory adaptive rule) is owed.
- **G4 — shock adaptive re-evaluation (stage 11):** a focused E2E assertion binding a **shock event** to the
  adaptive re-evaluation of `BusinessConditionProfile` + `InterventionMode`/`InterventionPhase` + priority +
  review cadence is owed.
- **G5 — required-lane promotion (stage 12):** owner-journey proof currently lives ONLY in the
  **non-required** browser lane (which is also the `next build` heap-OOM-prone lane). A future wave should
  promote a minimal, memory-stable owner-journey smoke into a **required** lane so owner-journey regressions
  block merges.

## The minimal seam
`tests/browser/owner-journey-map.ts` — a typed manifest (`OwnerJourneyDimension`, `OwnerJourneyProofState`,
`OwnerJourneyStage`, `OWNER_JOURNEY_STAGES`, `OWNER_JOURNEY_OPEN_GAPS`). Pure types + data, **no imports, no
product/business logic, not a `*.spec.ts`/`*.test.ts`**. Co-located with the existing
`owner-pilot-fixtures.ts` convention. `tests/**` is excluded from the whole-project `tsc` gate and no spec
imports the map yet, so it is **inert** in every CI lane until a future wave consumes it — at which point
that wave organises its E2E coverage off `OWNER_JOURNEY_STAGES`/`OWNER_JOURNEY_OPEN_GAPS` with no rewrite.

## Explicit STOP
Per the owner loop, execution **STOPS after this Wave-8 plan is merged and main is verified**. The full
Playwright build-out (closing G1–G5) is **NOT** started without a new owner instruction.

## Rules honored
- No product/source/schema/CI change. No test reactivated, none deleted, none weakened. Quarantine stays 86.
- Seam is a real, concrete interface (groundwork), not a stub/placeholder; it carries the actual journey data.
- All 27 referenced spec paths verified to exist.
