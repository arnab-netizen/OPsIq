# Gap Register

This file must be maintained by Claude during implementation.

No critical or high gap may remain open when moving to a later phase.

| ID | Date | Phase | Severity | Description | Risk | Required Fix | Status | Closure Evidence |
|---|---|---:|---|---|---|---|---|---|
| GAP-001 | 2026-07-04 | 2 | High | No Wealth Path Classifier in the required taxonomy (survival-cashflow / local-profit / multi-unit-scalable / asset-light / tech-product / marketplace / stepping-stone / owner-job / dead-end / trap). Existing `stage-classifier.ts` classifies operating condition, not structural wealth vehicle. | Owner cannot be told a business is a trap/dead-end/owner-job — the core cheat-code differentiator is absent. | Add deterministic `owner-strategy/wealth-path.ts` classifier + tests. | **Closed 2026-07-04** | `src/domain/owner-strategy/wealth-path.ts` (`classifyWealthPath`, all 10 categories); tests `src/__tests__/owner-strategy/wealth-path.test.ts` — 20 passed (high-quality/weak/dead-end/trap/owner-job + scalable categories + provisional). `tsc --noEmit` 0 errors; eslint clean. |
| GAP-002 | 2026-07-04 | 2 | High | No structural Business Model Quality Score (margin/repeatability/moat/owner-dependency/capital-intensity/wealth-ceiling). Existing `business-condition-profile.ts` scores current condition health, not structural wealth potential. | Wealth-path classification and later risk-adjusted scoring lack a structural quality input. | Add `scoreBusinessModelQuality` in the same module with input/missing/confidence disclosure. | **Closed 2026-07-04** | `src/domain/owner-strategy/wealth-path.ts` (`scoreBusinessModelQuality`, 7 weighted dimensions summing to 1.0, full Rule-D disclosure); tests assert weights sum, disclosure fields, provisional flag, no hallucination. |
| GAP-003 | 2026-07-04 | 3 | Medium | No owner-path Risk-Adjusted Wealth Score (only opportunity-viability `growth-opportunity.ts`). | Actions cannot be ranked by risk-adjusted expected wealth value. | Implement in Phase 3 consuming Phase 2 outputs. | **Closed 2026-07-04** | `src/domain/owner-strategy/risk-adjusted-wealth.ts` (`scoreRiskAdjustedWealth`, evidence-weighted); tests `src/__tests__/owner-strategy/risk-adjusted-wealth.test.ts` prove boring high-evidence action beats exciting low-evidence action (raw upside higher for expansion, risk-adjusted flips it). tsc 0 / eslint clean. |
| GAP-004 | 2026-07-04 | 3 | Medium | Opportunity Cost Review does not compare a recommendation against realistic capital alternatives (preserve cash / debt / retention / etc.). | Low-value actions may be optimized while ignoring higher-value alternatives. | Add deterministic `reviewOpportunityCost` (own module, not a duplicate of `opportunity-decision.service.ts` which decides a single opportunity, not cross-alternative comparison). | **Closed 2026-07-04** | `src/domain/owner-strategy/risk-adjusted-wealth.ts` (`reviewOpportunityCost`); tests prove expansion rejected for stabilization, rejected alternatives named with reason, "stabilize first" warning, and proposed-is-best path. |
| GAP-005 | 2026-07-04 | 7 | Medium | Workload Execution Engine lacks explicit transfer-level ladder (LEVEL_0..LEVEL_5); only utilization bands exist. | "Owner workload transfer" claims cannot be graded by safe automation level. | Add transfer-level classification in Phase 7. | Open — deferred to Phase 7 | Safe to progress. Closure: test mapping recommendations to levels 0/1/2/5. |
| GAP-006 | 2026-07-04 | 7 | Medium | No bundled Work Package artifact object (assignee/proof/deadline exist on `DelegatedTask` but not the full prepared-artifact bundle). | Recommendations may remain advice without prepared artifacts. | Compose Work Package over existing task-assignment in Phase 7. | Open — deferred to Phase 7 | Safe to progress. Closure: test proving recommendation → Work Package with artifacts + proof rules. |
| GAP-007 | 2026-07-04 | 8 | Low | Playbook source tiers are low/med/high, not the lettered A/B/C/D tiers in `execution.md` Phase 5. | Terminology mismatch; high-risk gating still functions via reliability tiers. | Map/extend `source-quality.ts` tiers in Phase 5. | Open — deferred to Phase 5 | Safe to progress. Closure: test proving Tier D/unsourced heuristic cannot drive high-risk recommendation. |
| GAP-008 | 2026-07-04 | 14 | Medium | Startup Mode Validation + Launch Workbench entirely absent. | Cannot help a beginner validate/launch a business (Final Completion Standard #1). | New module in Phases 14–15. | Open — deferred to Phase 14 | Safe to progress. Closure: beginner scenario produces validation-first Work Package + kill/pivot criteria. |
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
