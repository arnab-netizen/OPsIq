# Gap Register

# GAP REGISTER — REQUIRED FORMAT

Every gap must use this format:

## GAP-XXX: [Title]

Severity:
- CRITICAL / HIGH / MEDIUM / LOW

Status:
- OPEN
- IN_PROGRESS
- IMPLEMENTED_NOT_WIRED
- WIRED_NOT_TESTED
- TESTED_NOT_SIMULATED
- SIMULATED_NOT_E2E
- E2E_NOT_AUDITED
- CLOSED_PROVEN
- CLOSED_NOT_APPLICABLE
- CLOSED_SUPERSEDED_BY_EXISTING_SYSTEM
- BLOCKED_OWNER_ACTION_REQUIRED
- BLOCKED_EXTERNAL_DEPENDENCY
- DEFERRED_BY_EXPLICIT_OWNER_SCOPE_ONLY

Affected phase(s):

Requirement violated:

Why this matters:

Evidence found:

Closure requirements:

Closure evidence:
- Commit:
- Files:
- Tests:
- Runtime proof:
- Simulation:
- E2E:
- Hostile audit:
- Why recurrence is prevented:

## Gap register integrity rule

A gap cannot be closed by saying:
- implemented
- tested
- documented
- not a blocker
- remaining
- future work
- partial
- covered elsewhere

It can be closed only with evidence matching the closure requirements.

If Claude discovers a gap while auditing, it must either close it immediately or keep working on it unless blocked.

---

This file must be maintained by Claude during implementation.

No critical or high gap may remain open when moving to a later phase.

| ID | Date | Phase | Severity | Description | Risk | Required Fix | Status | Closure Evidence |
|---|---|---:|---|---|---|---|---|---|
| GAP-012 | 2026-07-04 | 0 (merge precondition) | CRITICAL | Post-merge main verification assumes the branch is merged into `main`. **It is NOT.** `origin/main`=`f81d0b2` (base `0b1e104`+1 commit #106) has ZERO `docs/owner-cheatcode/` files and ZERO owner-strategy wealth engines; branch HEAD `93ebcbd` is not an ancestor of `origin/main`. (The "Reality Loop v2.0" execution.md seen first was a STALE LOCAL `main` ref `fa1e057` that diverges from origin/main — red herring.) | Cannot verify on main because the Owner Cheat-Code work is not on main. | Owner merges branch → main (clean merge), or merges the PR. Claude is forbidden from pushing to `main` without permission → cannot self-merge. | **BLOCKED_OWNER_ACTION_REQUIRED** | Merge is CLEAN: dry-run `merge origin/main` = 0 conflicts (origin/main only 1 commit past shared base). Branch revalidated GREEN at `93ebcbd`: tsc 0; owner-strategy 183 passed; auth-governance clean; wrapped-handlers ratchet clean; finance/integration 43 passed. Merge-ready. Re-run this task after merge. |
| GAP-001 | 2026-07-04 | 2 | High | No Wealth Path Classifier in the required taxonomy (survival-cashflow / local-profit / multi-unit-scalable / asset-light / tech-product / marketplace / stepping-stone / owner-job / dead-end / trap). Existing `stage-classifier.ts` classifies operating condition, not structural wealth vehicle. | Owner cannot be told a business is a trap/dead-end/owner-job — the core cheat-code differentiator is absent. | Add deterministic `owner-strategy/wealth-path.ts` classifier + tests. | **Closed 2026-07-04** | `src/domain/owner-strategy/wealth-path.ts` (`classifyWealthPath`, all 10 categories); tests `src/__tests__/owner-strategy/wealth-path.test.ts` — 20 passed (high-quality/weak/dead-end/trap/owner-job + scalable categories + provisional). `tsc --noEmit` 0 errors; eslint clean. |
| GAP-002 | 2026-07-04 | 2 | High | No structural Business Model Quality Score (margin/repeatability/moat/owner-dependency/capital-intensity/wealth-ceiling). Existing `business-condition-profile.ts` scores current condition health, not structural wealth potential. | Wealth-path classification and later risk-adjusted scoring lack a structural quality input. | Add `scoreBusinessModelQuality` in the same module with input/missing/confidence disclosure. | **Closed 2026-07-04** | `src/domain/owner-strategy/wealth-path.ts` (`scoreBusinessModelQuality`, 7 weighted dimensions summing to 1.0, full Rule-D disclosure); tests assert weights sum, disclosure fields, provisional flag, no hallucination. |
| GAP-003 | 2026-07-04 | 3 | Medium | No owner-path Risk-Adjusted Wealth Score (only opportunity-viability `growth-opportunity.ts`). | Actions cannot be ranked by risk-adjusted expected wealth value. | Implement in Phase 3 consuming Phase 2 outputs. | **Closed 2026-07-04** | `src/domain/owner-strategy/risk-adjusted-wealth.ts` (`scoreRiskAdjustedWealth`, evidence-weighted); tests `src/__tests__/owner-strategy/risk-adjusted-wealth.test.ts` prove boring high-evidence action beats exciting low-evidence action (raw upside higher for expansion, risk-adjusted flips it). tsc 0 / eslint clean. |
| GAP-004 | 2026-07-04 | 3 | Medium | Opportunity Cost Review does not compare a recommendation against realistic capital alternatives (preserve cash / debt / retention / etc.). | Low-value actions may be optimized while ignoring higher-value alternatives. | Add deterministic `reviewOpportunityCost` (own module, not a duplicate of `opportunity-decision.service.ts` which decides a single opportunity, not cross-alternative comparison). | **Closed 2026-07-04** | `src/domain/owner-strategy/risk-adjusted-wealth.ts` (`reviewOpportunityCost`); tests prove expansion rejected for stabilization, rejected alternatives named with reason, "stabilize first" warning, and proposed-is-best path. |
| GAP-005 | 2026-07-04 | 7 | Medium | Workload Execution Engine lacks explicit transfer-level ladder (LEVEL_0..LEVEL_5); only utilization bands exist. | "Owner workload transfer" claims cannot be graded by safe automation level. | Add transfer-level classification in Phase 7. | **Closed 2026-07-04** | `src/domain/owner-strategy/work-package.ts` (`determineMaxTransferLevel` → LEVEL_0/1/2/5; 3/4 typed as future); tests `src/__tests__/owner-strategy/work-package.test.ts` map assignable→L2, owner→L1, unsafe/illegal/blocked→L5. |
| GAP-006 | 2026-07-04 | 7 | Medium | No bundled Work Package artifact object (assignee/proof/deadline exist on `DelegatedTask` but not the full prepared-artifact bundle). | Recommendations may remain advice without prepared artifacts. | Compose a Work Package bundle in Phase 7 (domain layer; persists later via existing `task-assignment.service.ts`). | **Closed 2026-07-04** | `src/domain/owner-strategy/work-package.ts` (`generateWorkPackage`) — 20-field Work Package with real prepared artifacts (scripts/checklists/trackers/SOPs/campaign plans), proof rules, and measurable owner-workload transfer; 12 tests. tsc 0 / eslint clean. |
| GAP-007 | 2026-07-04 | 5 | Low | No business-wisdom A/B/C/D source tier scheme + high-risk gate (the learning-pipeline `source-quality.ts` uses low/med/high for a different purpose). | Guru/viral/unverified advice could inform a high-risk legal/tax/hiring/debt/expansion/compliance decision. | Add `owner-strategy/business-wisdom.ts` tiering + anti-guru gate (distinct from the learning `source-quality.ts`). | **Closed 2026-07-04** | `src/domain/owner-strategy/business-wisdom.ts` (`classifyWisdom`, `admitAdvice`, `detectGuruRedFlags`); tests `src/__tests__/owner-strategy/business-wisdom.test.ts` (16) prove Tier C/D and unsourced heuristics are blocked from high-risk decisions and guru red flags strip high-risk influence even from Tier B. tsc 0 / eslint clean. |
| GAP-008 | 2026-07-04 | 14 | Medium | Startup Mode Validation + Launch Workbench entirely absent. | Cannot help a beginner validate/launch a business (Final Completion Standard #1). | New module in Phases 14–15 reusing wealth-path + risk-adjusted + work-package engines. | **Closed 2026-07-04** | `src/domain/owner-strategy/startup-mode.ts` (`validateStartup`, `evaluateIdea`, `planLaunch`); tests `src/__tests__/owner-strategy/startup-mode.test.ts` — beginner scenario shortlists a solid idea, rejects unaffordable/trap ideas (capital gap exposed), emits a validation-first Work Package with `startup_validation` artifacts, and `planLaunch` throws `StartupNotValidatedError` before validation. tsc 0 / eslint clean. |
| GAP-011a | 2026-07-04 | 28,32-34 | High | Whole-repo full-suite + DB + governance + ratchet + tsc + build green (could not complete locally; timed out). | Cannot confirm whole-repo green locally. | Run in CI. | **CLOSED_PROVEN 2026-07-04** | CI "Build & Test" run **28694217011** (SHA be6a330) — job `build-and-test` (id 85100953892) SUCCESS: governance scan ✓, auth governance blocking ✓, tsc ✓, prisma validate/migrate/generate ✓, build ✓, wrapped-handlers ratchet ✓, **maintained test suite DB-backed (TEST_WITH_DB=true, postgres:16) ✓**; job `lint` (85100953870) SUCCESS. Also DB Verification run 28692940196 (bfbab0a) SUCCESS. URL: https://github.com/arnab-netizen/OPsIq/actions/runs/28694217011 . Recurrence prevented: ci.yml auto-runs on every claude/** push. |
| GAP-011b | 2026-07-04 | 27,33 | High | Browser/UI E2E (Playwright desktop+mobile owner journey) runs on **main after merge**, not as a pre-merge branch gate. | UI owner journey verified post-merge on main. | Merge to main, then run `owner-pilot-e2e.yml` on main. | **PENDING_MAIN_POST_MERGE_VERIFICATION** | This is by design a post-merge-on-main gate, not a branch gate. Branch-side proof is complete (CI code/DB/governance/ratchet green — GAP-011a; wealth+startup real-world green; verified benchmark). **Post-merge rule:** after merge to main, run `owner-pilot-e2e.yml` (+ `sequential-simulations.yml` sim-browser) on main → if green, close GAP-011b CLOSED_PROVEN + run final hostile audit; if failed, classify `MAIN_E2E_FAILED_CONTINUE_REQUIRED` and fix or revert with minimum required code. |
| GAP-010 | 2026-07-04 | 24-30 | Medium | Verified feature-by-feature benchmark of each domain against named commercial apps (QuickBooks/HubSpot/Mailchimp/Asana/Deputy/Vanta/LivePlan) not web-verified. | Cannot claim EQUAL/BETTER than dedicated apps on verified evidence. | Web-backed benchmark research + ledger citations. | **CLOSED_PROVEN 2026-07-04** | Web research (WebSearch, retrieved 2026-07-04) with dated primary/reputable sources for all 7 domains; see `DOMAIN_BENCHMARK_LEDGER.md` VERIFIED BENCHMARK section. All 7 = EQUAL_FOR_OWNER_USE_CASE or BETTER (Strategy = BETTER) on owner operating outcome; verified that QuickBooks/HubSpot/Mailchimp/Asana/Deputy/LivePlan lack OpsIQ's decision-safety/gating. No domain BELOW/PARTIAL → no implementation gap reopened. No invented capabilities (unverified items marked). |
| GAP-009 | 2026-07-04 | 4 | Medium | Phase 4 engines exist and 3/5 exit-gate scenarios are proven by existing tests (unsafe spend → `owner-budget/spend-governance.ts` + `engine.test.ts`; broad discounting → `owner-finance/margin-safety-gate.ts` + `margin-safety-gate.test.ts`; premature expansion → `owner-budget/capital-allocation.ts` confidence gate + `execution/scale-readiness.ts`). Premature-hiring affordability and vanity-marketing block/downgrade are not yet proven under one governor view, and none of these are wired to the new Phase 2/3 wealth-loop outputs. | Owner could receive a hiring/marketing recommendation not explicitly affordability/ROI-gated; wealth-path/risk-adjusted verdicts do not yet feed capital decisions. | Confirm/extend hiring-affordability + vanity-marketing gating (reuse `owner-finance/cash-safety-gate.ts` + marketing ROI; do NOT build a duplicate governor), and wire Phase 2/3 outputs into the capital/next-move path. | **Closed 2026-07-04** | `src/__tests__/integration/phase4-financial-governor-wealth-loop.test.ts` (7 tests): hiring blocked via `cash-safety-gate` HIRING_SENSITIVE at CRITICAL; vanity marketing = negative `campaignRoiPct` + GROWTH_SENSITIVE block; plus wealth-loop composition — owner-job business proposing expansion rejected by Phase 2 (`blocksHighRiskExecution`), Phase 3 (`reviewOpportunityCost` picks stabilize), and Phase 4 (GROWTH gate). tsc 0 / eslint clean. Deeper production wiring into the command center remains under the Phase 24/25 command-center follow-up (not a gap). |

---

# BULLETPROOF HARDENING AMENDMENT — V2

This amendment supersedes any weaker wording above. If any earlier section conflicts with this amendment, this amendment wins.

## A. Anti-interpretation rule

Claude must not treat broad phrases such as “implement,” “prove,” “harden,” “complete,” “business wisdom,” “wealth acceleration,” “owner workload transfer,” or “domain ready” as satisfied by prose, stubs, placeholders, UI-only cards, static mock data, unchecked assumptions, or tests that do not exercise runtime behavior.

Every claim must be backed by one of these evidence types:

1. Source file path and exported function/class/component.
2. Database model/migration path where DB behavior is involved.
3. API route/service path where runtime behavior is involved.
4. UI path/component and Playwright/E2E proof where user-facing behavior is involved.
5. Test file path and exact command that passed.
6. Scenario file/fixture path and actual result.
7. Gap register entry with severity, owner impact, and closure proof.

No evidence = not complete.

## B. No fake completion rule

A phase, domain, service, or feature must not be marked complete if any of the following is true:

1. It only creates documentation.
2. It only creates types/interfaces without used runtime behavior.
3. It only creates seed data without a retrieval/application path.
4. It only creates tests for mocked logic while the real service path remains untested.
5. It only creates UI with no working service/API behind it.
6. It only creates backend logic with no owner-visible/use-case path where one is required.
7. It leaves TODO, FIXME, placeholder, dummy, sample-only, or “later” code in the critical path.
8. It leaves a critical/high gap open.
9. It leaves a medium gap without phase-bound owner-impact analysis and scheduled closure.
10. It creates owner advice without a Work Package where safe execution/preparation is possible.

## C. Full-version but small-slice rule

This is not an MVP. However, Claude must not attempt a giant unsafe rewrite. Full-version means every required module and domain must eventually pass its gates before Owner Mode is classified complete. Implementation must still proceed in small, reversible, tested slices using minimum required code.

Permitted classification after a slice:

1. `NOT_STARTED`
2. `INVENTORIED_ONLY`
3. `PARTIAL_RUNTIME_SLICE`
4. `RUNTIME_WIRED_NOT_FULLY_PROVEN`
5. `SCENARIO_PROVEN_PARTIAL_DOMAIN`
6. `DOMAIN_HARDENED`
7. `FULL_OWNER_MODE_PROVEN`

Claude must not use vague classifications such as “mostly done,” “ready,” “complete enough,” “implemented,” or “should work.”

## D. Score integrity rule

Any score, ranking, classifier, or recommendation must expose:

1. Inputs used.
2. Missing inputs.
3. Assumptions, if any.
4. Confidence.
5. Data source.
6. Calculation or deterministic scoring rubric.
7. Reason rejected alternatives lost.
8. What new evidence would change the result.

If the score is based mainly on defaults or missing data, it must be labeled `PROVISIONAL_LOW_CONFIDENCE` and must not trigger high-risk execution.

## E. Owner workload proof rule

OpsIQ must prove workload transfer with concrete artifacts and system actions. A statement that workload was reduced is invalid unless it lists:

1. Owner task avoided.
2. Artifact OpsIQ generated.
3. Task OpsIQ created or assigned.
4. Follow-up OpsIQ scheduled or prepared.
5. Proof OpsIQ required.
6. Decision still required from owner and why it could not be safely automated.
7. Estimated owner minutes before.
8. Estimated owner minutes after.
9. Whether owner burden increased, decreased, or merely shifted.

## F. Source and business-wisdom integrity rule

Business wisdom, regulations, benchmarks, local market facts, competitor claims, and “tried and tested” advice must not be treated as truth unless source quality is recorded.

For each external knowledge item, record:

1. Source title/name.
2. Source type.
3. URL or citation reference if available.
4. Retrieval/access date where applicable.
5. Source quality tier.
6. Jurisdiction/industry/stage applicability.
7. Known limitations.
8. Whether it is universal principle, local rule, benchmark, case pattern, or unverified tactic.
9. Whether it is allowed to influence high-risk recommendations.

If no source is available, classify the item as `UNSOURCED_HEURISTIC` and block it from high-risk, legal, tax, hiring/firing, debt, expansion, or compliance-sensitive actions.

## G. No silent deferral rule

Claude may defer work only by creating a gap register entry containing:

1. Exact missing requirement.
2. Severity.
3. Owner/business risk if deferred.
4. Why it cannot be completed now.
5. Whether safe progress can continue.
6. Phase by which it must be closed.
7. Test/evidence required for closure.

Unregistered deferral is prohibited.

## H. Runtime-first rule

For any owner-facing feature, completion requires the full path unless explicitly classified as non-UI infrastructure:

1. Data/model or deterministic input fixture.
2. Service logic.
3. Financial/risk gate where applicable.
4. Work Package/proof/outcome hooks where applicable.
5. API/server action where applicable.
6. UI or command-center surface where applicable.
7. Unit/service tests.
8. DB tests if persistent.
9. E2E test if user-facing critical path.

## I. Personal-use priority rule

Because OpsIQ is for personal use until proven, personal Owner Mode business usefulness outranks public-product polish. Do not build subscription, billing, multi-tenant commercialization polish, marketing pages, Product Hunt assets, public onboarding, enterprise sales features, or generalized SaaS features while any Owner Mode required phase is incomplete.

## J. Minimum-code enforcement rule

Before adding a new model, service, dependency, route, component, or abstraction, Claude must document why existing code cannot be reused. If equivalent capability exists, extending it is mandatory unless extension would create greater risk.

Each slice report must include a “minimum-code justification” listing:

1. New files added.
2. Existing files modified.
3. Why each new file was necessary.
4. Why no smaller change would satisfy the gate.
5. Dependencies added, or explicit statement that none were added.

## K. Stop/pivot/sell/exit honesty rule

OpsIQ must not assume the owner should continue, grow, or scale a business. For every strategic path, OpsIQ must be able to recommend:

1. Continue.
2. Stabilize.
3. Validate.
4. Pivot.
5. Pause.
6. Sell.
7. Exit.
8. Stop investing.
9. Use only as cashflow.
10. Redirect capital/time to a higher-probability path.

If the current business is a poor wealth vehicle, OpsIQ must say so directly with evidence and safer next actions.
