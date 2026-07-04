# OpsIQ Real-World Readiness Hardening + Full Mobile — Gap Audit Plan

> Assess what is still lacking after the merged exhaustive chaos replay (PR #64) and harden ONLY the real
> gaps, minimum-code, reusing existing runtime/provider seams. No new engines, no duplicate confidence/
> readiness/supervisor systems, no autonomy, no live-outcome claim without live data.

- **Branch:** `claude/real-world-readiness-hardening-full-mobile`
- **Base HEAD:** `243cabfa71e409e56e7a6feb30f935b914cbf8da` (includes merged PR #64)

## 1. What OpsIQ already does per target area (measured — file:line)

| Area | Already does | Runtime location |
|---|---|---|
| Input quality / data sufficiency | Default-on gate → BLOCK / OWNER_REVIEW / PROFESSIONAL_REVIEW; confidence bands from real/stale/missing critical domains | `recommendation-input-quality-gate.ts`, `gate-enforcement-policy.ts`, `owner-domain-ingestion.ts:118` |
| Confidence from weak/stale/conflicting | `overallConfidence` none/low/medium/high; missing critical ⇒ low; stale ⇒ ≤medium | `owner-domain-ingestion.ts`, `supervisor-summary.ts` deriveConfidence |
| Next-best data request (ranked) | `nextBestInput` + `missingDataRequests` ranked by severity/impact/effort; responsible party | `input-guidance.ts:187`, `guidance-orchestrator.ts`, `action-assignment.ts` |
| Local/legal/professional boundary | 4-tier classifier informational/caution/professional_review_required/blocked_until_review; disclaimer | `compliance-boundary.ts:43`, `guidance-classification.ts` |
| Novelty / OOD | Confidence suppression + action-status when critical domains missing; high-risk never auto-proceeds | `supervisor-summary.ts:152`, `action-status-policy.ts`; `novelty-training.test.ts` |
| Expected-vs-actual outcome loop | Expected side (successMetrics, expectedOutcome, reassessmentTrigger, stopLoss) + actual side (OwnerFinanceVerification before/after, OwnerSelfEvaluation actual, OwnerActionOutcome) + variance>200% + reassessment scheduling + fraud check | `outcome/verification.ts`, `self-evaluation.service.ts`, `owner-finance/verification.service.ts` |
| 5-second dashboard | SupervisorSummary panel: mainIssue/why/doNow/doNotDo/owner-delegate/proof/action-status/confidence/missing-assumptions/impact/reassessment; advanced reasoning collapsed; no static fallback | `SupervisorSummary.tsx` |
| Readiness classification | 10 dimensions, 8 hard blockers, runtime-path gate, max-reliability gate, `pilotReady` boolean | `readiness-score.ts:109`, `owner-readiness.service.ts` |
| Learning-governance / adjudication | Deterministic causal adjudication (rerank/suppress) + controlled-learning eligibility (12 classes, human-approved, workspace-scoped, no synthetic/AI promotion) | `causal-adjudication.ts:216`, `controlled-learning.ts:55` |
| Exhaustive chaos: DB + desktop | 180/180 DB-backed + 180/180 desktop browser (merged PR #64) | `exhaustive-db.db.test.ts`, `21-chaos-exhaustive-desktop.spec.ts` |
| Mobile chaos | REPRESENTATIVE 45/180 | `22-chaos-exhaustive-mobile.spec.ts` |

## 2. What is already proven by tests (must not be rebuilt)
- Input-quality gate, confidence bands, professional-review routing, novelty behaviour, action-status policy, supervisor summary, readiness blockers, adjudication/learning-governance, DB+desktop chaos (180), representative mobile (45), owner-pilot, max-reliability ratchet, source/privacy, business-scope isolation.

## 3. What is missing (real gaps)
1. **Full mobile all-180** — only 45/180 mobile proven. Concrete, verifiable gap.
2. **Pilot-readiness STATE policy (overclaim prevention)** — readiness is a binary `pilotReady`; there is NO code-enforced readiness-state ladder (SIMULATION_PROVEN … LIVE_OUTCOME_PROVEN … PUBLIC_SAAS_READY) that forbids claiming a live/profit outcome from simulation/DB/mobile evidence. §10 requires a testable policy.
3. **Shadow-pilot mode** — no thin mode/report that takes partial real data, separates verified facts from assumptions, lists prep-now vs wait-for-owner, an intake checklist, and refuses live-outcome claims. §11.
4. **Consolidation tests** proving the prompt's explicit assertions map onto the EXISTING input-quality / boundary / novelty / outcome-loop / dashboard behaviour (no new runtime).

## 4. What is NOT missing and MUST NOT be rebuilt
Input-quality engine, confidence engine, next-best ranking, compliance-boundary classifier, novelty (= missing-critical) suppression, outcome verification/self-evaluation, SupervisorSummary panel, readiness-score dimensions/blockers, adjudication, controlled-learning. These are reused, not duplicated.

## 5. Minimum-code closure plan
- **Gap 1 (full mobile):** convert `22-chaos-exhaustive-mobile.spec.ts` from representative → **all 180** (data-driven over `CHAOS_LEDGER`, sharded by category), write mobile run-ledger; extend `chaos-exhaustive.yml` with a full-mobile matrix lane.
- **Gap 2 (pilot reality guardrail):** new pure `src/domain/owner-mode/pilot-readiness-policy.ts` — a typed `ReadinessState` ladder + `assertReadinessClaim(state, evidence)` that forbids overclaim (simulation/DB/mobile ⇏ live outcome/profit; public-SaaS needs live-outcome or explicit waiver). Pure, deterministic, no DB, no model. Tests enforce it. A thin surfacing helper returns the honest state.
- **Gap 3 (shadow pilot):** new pure `src/domain/owner-mode/shadow-pilot.ts` — `buildShadowPilotReport(input)` over EXISTING readiness + ingestion + input-guidance + supervisor summary: separates verifiedFacts vs assumptions, prepNow vs waitForOwner, intakeChecklist, first-7-day plan, owner-workload estimate, and a hard `liveOutcomeClaim: false`. No new runtime service; a pure derivation.
- **Gap 4 (consolidation tests):** targeted tests asserting existing runtime meets the §5–§9 requirements.

## 6. Exact files likely to change / add
- Add: `src/domain/owner-mode/pilot-readiness-policy.ts`, `src/domain/owner-mode/shadow-pilot.ts`.
- Add tests: `pilot-readiness-policy.test.ts`, `shadow-pilot.test.ts`, `input-quality-consolidation.test.ts`, `boundary-novelty-consolidation.test.ts`, `outcome-loop-consolidation.test.ts`.
- Change: `tests/browser/22-chaos-exhaustive-mobile.spec.ts` → full 180 (or add `23-chaos-exhaustive-mobile-full.spec.ts`); `.github/workflows/chaos-exhaustive.yml` (+ full-mobile lane); `chaos-ledger.ts` (optional `playwrightMobileStatus` already present — no change needed).
- Add: gate-protection check `src/__tests__/behavioral-validation/chaos-replay/gate-protection.test.ts`.
- Reports (see §14).

## 7. Exact tests to add
Input-quality (10), boundary (9), novelty (11), outcome-loop (9), 5-sec dashboard (desktop+mobile), pilot-reality (8), shadow-pilot (10), gate-protection (5), full-mobile (all 180). Where an assertion is already covered by an existing test, cite it rather than duplicate.

## 8. Exact DB proof needed
Reuse the merged all-180 DB lane (no change). Shadow-pilot + outcome-loop consolidation may use the existing DB-backed `getOwnerWholeBusinessPlan` for one representative business (no new heavy DB seeding).

## 9. Exact desktop proof needed
Reuse the merged 180/180 desktop lane (no change). 5-second dashboard reuses spec 18 (already desktop+mobile).

## 10. Exact full mobile proof needed
All 180 chaos scenarioIds through real mobile Playwright (375×812), DB-backed, scenarioId traceable, panel + dominant + status + proof/reassessment visible, no horizontal overflow, no fatal console errors, mobile run-ledger 180/180. Sharded by category (15×12) or CI matrix. Fails if <180.

## 11. CI sharding plan
Extend `chaos-exhaustive.yml`: the browser matrix already builds+seeds all 180; add the full-mobile spec to each shard (each shard runs its category slice at mobile viewport) OR a dedicated full-mobile matrix. Assert union == 180.

## 12. Anti-skip plan
Full-mobile spec asserts it ran exactly its ledger slice; a coverage test asserts the union of shard slices == 180; gate-protection test fails if mobile count <180 for the full-mobile claim, if any counted scenario lacks a ledger entry, or if a classification exceeds evidence.

## 13. What will explicitly NOT be claimed
- No live-outcome / profit-improvement claim (no live business data) — guardrail enforces this.
- No PUBLIC_SAAS_READY.
- No new confidence/readiness/supervisor engine.
- If full-mobile all-180 is not achieved, `FULL_MOBILE_CHAOS_READY` is not claimed.

## 14. Final classification gates
- `REAL_WORLD_GAP_AUDIT_COMPLETE` — audits done.
- `FULL_MOBILE_CHAOS_READY` — all 180 mobile pass (ledger 180/180).
- `SHADOW_PILOT_READY` — shadow-pilot mode + tests pass.
- `REAL_WORLD_READINESS_HARDENED_FULL_MOBILE` — all of: audits, gaps closed (input-quality/boundary/novelty/outcome/dashboard proven; pilot guardrail; shadow pilot), all-180 mobile + DB + desktop green, no-regression green, no overclaim. Only if every condition holds.

Reports: `OPSIQ_REAL_WORLD_READINESS_LACKING_AUDIT.md`, `OPSIQ_REAL_WORLD_READINESS_GATE_PROTECTION_AUDIT.md`, `OPSIQ_REAL_WORLD_READINESS_HARDENING_FULL_MOBILE_REPORT.md`.
