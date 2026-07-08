# Quarantine Inventory — Phase 1 (Diagnostic-Core Reactivation)

- Branch: `claude/phase-1-diagnostic-core-reactivation` · Base: `origin/main @ 49649a6e`
- Date: 2026-07-07
- Quarantine root: `src/__ignored_tests__/` (excluded from vitest via `exclude: ["**/__ignored_tests__/**"]`)
- **Total quarantined before this phase: 97** · **Reactivated: 4** · **Remaining: 93**

## Method / columns
For each entry: path · domain · why-ignored · dependencies · obsolete? · still-relevant? · proposed action · risk-if-left · diagnostic-core-related?

**Why-ignored (shared root cause):** these files live under `src/__ignored_tests__/`, which the vitest config excludes wholesale. They were bulk-moved into that tree during earlier CI-stabilization work (the diagnostic-core `__tests__` dir last moved in PR #129 "Process intelligence UI surface depth pass"). The move broke each engine test's `../<engine>` relative import (the source was not moved with the test), so they cannot pass from the quarantine location — reactivation requires relocating each test beside its source. No per-file "reason" annotation exists in-repo; the exclusion is directory-level, not assertion-level.

**Dependencies:** only 3 of the 93 remaining reference a DB (`[db]`/`TEST_WITH_DB`/`PrismaClient`/`@/generated/prisma`); the majority are unit/component/integration tests with no DB dependency but require re-homing and (for some) fixture/API refresh.

---

## A. Reactivated this phase (4) — diagnostic-core inference engines
Moved `git mv` from `src/__ignored_tests__/services/diagnostic-core/__tests__/` to `src/services/diagnostic-core/__tests__/` (relative `../<engine>` import now resolves to real source). Pure-unit, no DB. Diagnostic-core: **YES**.

| Test | Source under test | Covers |
|---|---|---|
| `root-cause-engine.test.ts` | `src/services/diagnostic-core/root-cause-engine.ts` | root-cause inference, hypothesis competition, fail-closed data-sufficiency, contradiction detection, evidence-vs-confidence |
| `archetype-engine.test.ts` | `src/services/diagnostic-core/archetype-engine.ts` | archetype classification, fail-closed gate, uncertainty exposure |
| `bottleneck-engine.test.ts` | `src/services/diagnostic-core/bottleneck-engine.ts` | bottleneck detection, fail-closed gate, uncertainty exposure |
| `maturity-engine.test.ts` | `src/services/diagnostic-core/maturity-engine.ts` | maturity assessment, fail-closed gate, maturity gaps, uncertainty exposure |

**Proposed action:** REACTIVATED (done). **Risk if left ignored:** diagnostic inference correctness (the product's core reasoning) is entirely unproven in CI.

## B. Still quarantined — high-value diagnostic/recommendation follow-ups (next waves)
These are the strongest candidates for the *next* reactivation wave; kept quarantined now to keep this phase minimal and lowest-risk (they have broader deps — DB, engagement fixtures, or route/component harnesses — that need per-file refresh and cannot be statically proven pass without execution):

- `src/__ignored_tests__/services/__tests__/recommendation.priority.test.ts` — recommendation ranking
- `src/__ignored_tests__/services/__tests__/recommendation.reranking.test.ts` — recommendation reranking
- `src/__ignored_tests__/services/control/__tests__/recommendation.test.ts` — recommendation (control)
- `src/__ignored_tests__/services/intelligence/__tests__/recommendation.test.ts` — recommendation (intelligence)
- `src/__ignored_tests__/services/diagnosis.integration.test.ts` — diagnosis integration (likely DB)
- `src/__ignored_tests__/services/recommendation.integration.test.ts` — recommendation integration (likely DB)
- `src/__ignored_tests__/integration/scenarios/f3-wrong-diagnosis.test.ts` — wrong-diagnosis scenario
- `src/__ignored_tests__/services/consulting-engine/__tests__/pipeline.test.ts` — consulting-engine pipeline
- `src/__ignored_tests__/services/best-path-engine/__tests__/orchestrator.test.ts` — best-path orchestrator
- `src/__ignored_tests__/services/contradiction-detector/__tests__/detector.test.ts` — contradiction detection
- `src/__ignored_tests__/services/calibration/__tests__/engine.test.ts` — calibration engine
- `src/__ignored_tests__/services/intelligence/__tests__/*` — intelligence layer

**Proposed action:** REACTIVATE in a follow-up wave, one cluster at a time, once each can be executed (recommendation-ranking cluster first). **Risk if left ignored:** recommendation ranking + end-to-end diagnosis remain unproven.

## C. Complete remaining-quarantined list (93)
Full map of everything still under `src/__ignored_tests__/` after this phase. Domains: `services/*` (52), `app/*` API routes (13), `integration/scenarios` (11), `ui`/`*.tsx` components (component-harness), `lib`, plus top-level flow/adversarial suites. Default proposed action for all: **REACTIVATE in later waves, grouped by owning module, only when executable and current** — none to be deleted, none to be weakened.

- `src/__ignored_tests__/action-center.test.tsx`
- `src/__ignored_tests__/app/api/__tests__/audit-blocked-paths.test.ts`
- `src/__ignored_tests__/app/api/__tests__/dashboard-blocked-metrics.test.ts`
- `src/__ignored_tests__/app/api/__tests__/phase4-kill-test.test.ts`
- `src/__ignored_tests__/app/api/__tests__/phase8-api-hardening.test.ts`
- `src/__ignored_tests__/app/api/__tests__/rbac-enforcement.test.ts`
- `src/__ignored_tests__/app/api/__tests__/test-reliability.test.ts`
- `src/__ignored_tests__/app/api/calibration/__tests__/route.test.ts`
- `src/__ignored_tests__/app/api/decisions/__tests__/execution-endpoints.test.ts`
- `src/__ignored_tests__/app/api/engagements/[engagementId]/shock-events/route.test.ts`
- `src/__ignored_tests__/app/api/engagements/intervention-routes.test.ts`
- `src/__ignored_tests__/app/api/operator/__tests__/queue.test.ts`
- `src/__ignored_tests__/app/api/opsiq/consulting-engine/__tests__/route.test.ts`
- `src/__ignored_tests__/app/api/value/__tests__/route.test.ts`
- `src/__ignored_tests__/db-persistence-validation.test.ts`
- `src/__ignored_tests__/decision-lifecycle-adversarial.test.ts`
- `src/__ignored_tests__/findings-manager.test.tsx`
- `src/__ignored_tests__/integration/scenarios/f-core-behaviors.test.ts`
- `src/__ignored_tests__/integration/scenarios/f1-revenue-collapse.test.ts`
- `src/__ignored_tests__/integration/scenarios/f10-partial-recovery.test.ts`
- `src/__ignored_tests__/integration/scenarios/f2-low-cash.test.ts`
- `src/__ignored_tests__/integration/scenarios/f3-wrong-diagnosis.test.ts`
- `src/__ignored_tests__/integration/scenarios/f4-execution-failure.test.ts`
- `src/__ignored_tests__/integration/scenarios/f5-vendor-failure.test.ts`
- `src/__ignored_tests__/integration/scenarios/f6-overload.test.ts`
- `src/__ignored_tests__/integration/scenarios/f7-contradictory-kpi.test.ts`
- `src/__ignored_tests__/integration/scenarios/f8-delayed-roi.test.ts`
- `src/__ignored_tests__/integration/scenarios/f9-competitor-response.test.ts`
- `src/__ignored_tests__/lib/__tests__/visibility.integration.test.ts`
- `src/__ignored_tests__/lib/auth-guard.test.ts`
- `src/__ignored_tests__/mvp-db-execution.test.ts`
- `src/__ignored_tests__/mvp-operational-flow.test.ts`
- `src/__ignored_tests__/recommendations-manager.test.tsx`
- `src/__ignored_tests__/services/__tests__/adapters.test.ts`
- `src/__ignored_tests__/services/__tests__/decision-determinism.test.ts`
- `src/__ignored_tests__/services/__tests__/evidence-integrity.test.ts`
- `src/__ignored_tests__/services/__tests__/phase7-module-logic.test.ts`
- `src/__ignored_tests__/services/__tests__/recommendation.priority.test.ts`
- `src/__ignored_tests__/services/__tests__/recommendation.reranking.test.ts`
- `src/__ignored_tests__/services/__tests__/service-auth.test.ts`
- `src/__ignored_tests__/services/action.integration.test.ts`
- `src/__ignored_tests__/services/best-path-engine/__tests__/orchestrator.test.ts`
- `src/__ignored_tests__/services/business-condition.test.ts`
- `src/__ignored_tests__/services/business-impact/business-impact.service.test.ts`
- `src/__ignored_tests__/services/calibration/__tests__/engine.test.ts`
- `src/__ignored_tests__/services/client-account.test.ts`
- `src/__ignored_tests__/services/client-contact.test.ts`
- `src/__ignored_tests__/services/consulting-engine/__tests__/pipeline.test.ts`
- `src/__ignored_tests__/services/contradiction-detector/__tests__/detector.test.ts`
- `src/__ignored_tests__/services/control/__tests__/decision-gate.test.ts`
- `src/__ignored_tests__/services/control/__tests__/enforcement-integration.test.ts`
- `src/__ignored_tests__/services/control/__tests__/execution-flow-trace.test.ts`
- `src/__ignored_tests__/services/control/__tests__/recommendation.test.ts`
- `src/__ignored_tests__/services/control/__tests__/variable-registry.test.ts`
- `src/__ignored_tests__/services/decision-control/decision-control.service.test.ts`
- `src/__ignored_tests__/services/decision-evidence/decision-evidence.service.test.ts`
- `src/__ignored_tests__/services/diagnosis.integration.test.ts`
- `src/__ignored_tests__/services/engagement-health.test.ts`
- `src/__ignored_tests__/services/engagement.test.ts`
- `src/__ignored_tests__/services/evidence-action-lifecycle.integration.test.ts`
- `src/__ignored_tests__/services/evidence.integration.test.ts`
- `src/__ignored_tests__/services/execution-drift/execution-drift.service.test.ts`
- `src/__ignored_tests__/services/execution-drift/next-action.service.test.ts`
- `src/__ignored_tests__/services/failure-containment/__tests__/containment-engine.test.ts`
- `src/__ignored_tests__/services/findings.integration.test.ts`
- `src/__ignored_tests__/services/funnel-analysis/__tests__/funnel-analyzer.test.ts`
- `src/__ignored_tests__/services/idempotency.test.ts`
- `src/__ignored_tests__/services/intelligence/__tests__/recommendation.test.ts`
- `src/__ignored_tests__/services/kpi.integration.test.ts`
- `src/__ignored_tests__/services/lead.test.ts`
- `src/__ignored_tests__/services/lifecycle.integration.test.ts`
- `src/__ignored_tests__/services/operator/__tests__/priority.test.ts`
- `src/__ignored_tests__/services/outcome/__tests__/outcome-accuracy.test.ts`
- `src/__ignored_tests__/services/reality-awareness/__tests__/human-factors-engine.test.ts`
- `src/__ignored_tests__/services/recommendation.integration.test.ts`
- `src/__ignored_tests__/services/report-generator.integration.test.ts`
- `src/__ignored_tests__/services/report-generator.test.ts`
- `src/__ignored_tests__/services/review-cycle.integration.test.ts`
- `src/__ignored_tests__/services/role-assignment.integration.test.ts`
- `src/__ignored_tests__/services/segmentation/__tests__/impact.test.ts`
- `src/__ignored_tests__/services/shock-event.integration.test.ts`
- `src/__ignored_tests__/services/user.integration.test.ts`
- `src/__ignored_tests__/services/validation-contracts/__tests__/contract-validator.test.ts`
- `src/__ignored_tests__/services/value/__tests__/tracker.test.ts`
- `src/__ignored_tests__/services/visibility.placeholder.test.ts`
- `src/__ignored_tests__/ui/execution-certainty-card.test.tsx`
- `src/__ignored_tests__/ui/owner-dashboard.test.tsx`
- `src/__ignored_tests__/ui/report-client.test.tsx`
- `src/__ignored_tests__/v72-hostile-audit.test.ts`
- `src/__ignored_tests__/value-proof-accuracy.test.ts`
- `src/__ignored_tests__/value-proof-roi.test.ts`
- `src/__ignored_tests__/webhook.test.ts`
- `src/__ignored_tests__/workspace-isolation-enforcement.test.ts`

---
## Rules honored
- No quarantined test deleted. No assertion weakened. Reactivation was a `git mv` (history preserved), not a rewrite.
- Only the 4 pure-unit diagnostic-core engine tests were reactivated this phase (smallest meaningful subset with clear 1:1 source ownership and statically-verifiable consistency). All others remain quarantined with a documented reason and a proposed future action.
