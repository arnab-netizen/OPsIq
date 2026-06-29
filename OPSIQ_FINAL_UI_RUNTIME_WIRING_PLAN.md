# OpsIQ Final UI Runtime Wiring + Browser Whole-Business Plan E2E — Plan

Branch: `claude/opsiq-jarvis-360-audit-m8jro7` · Base HEAD: `8071811` ·
Current classification: `PRODUCTION_DB_INGESTION_READY`.

Goal: close the single remaining blocker — surface the **new production owner-advice runtime**
(`runOwnerAdvice` + `buildOwnerDomainProviders`) in the **browser** command center, proven by a real
Playwright E2E against a seeded postgres-backed business.

## 1. Exact UI surface currently rendering command-center summary
`src/app/(authenticated)/owner/page.tsx` (`OwnerCommandCenterPage`, client component). It loads:
- `GET /api/owner/command-center` → Business Condition Profile (health/risk/next action).
- `GET /api/owner/control-center` → safety/blocked/attention panel (`data-testid="owner-control-center"`).
The page renders "Business condition", "OpsIQ control center", "Do this next", "Domain scores",
"Reassessment". It does **not** yet render the new whole-business runtime output.

## 2. Exact runtime/service currently feeding that UI
- `/api/owner/command-center` → `getBusinessCondition` (owner-condition service).
- `/api/owner/control-center` → `getBusinessCondition` + `getOwnerControlCenter` + `getOwnerBlockMetrics`.
Neither uses `runOwnerAdvice` / `buildOwnerDomainProviders` / the whole-business plan engines.

## 3. Exact integration point for owner-advice-runtime
New centralized service + thin canonical route + one new page section (no business logic in the page):
- `src/services/owner-mode/owner-whole-business-plan.service.ts` — `getOwnerWholeBusinessPlan({db, workspaceId, businessId, now})`:
  1. `prefetchOwnerDomainRows` (DB rows, workspace/business scoped) — one async pass.
  2. `buildProvidersFromRows` → real DB providers (`buildOwnerDomainProviders` refactored to share the prefetch).
  3. `deriveOwnerContext(rows)` → a real `OwnerBusinessContext` from persisted records (archetype/location/
     decisionCategory/numbers/riskFlags/messyFacts), so the PLAN reflects DB state.
  4. `new PrismaLearningStore(db)` → real workspace-private learning.
  5. `runOwnerAdvice({workspaceId, context}, {store, providers})` → whole-business plan + ingestion report.
  6. Assemble a serializable `OwnerWholeBusinessPlanView` DTO.
- `src/services/owner-mode/owner-context-derivation.ts` — pure `deriveOwnerContext` + archetype/location helpers.
- `src/app/api/owner/whole-business-plan/route.ts` — `withCanonicalEnforcement`, `OWNER_VIEW`, `requireWorkspace`,
  reads `businessId` param, calls the service with `db` + `ctx.verifiedWorkspaceId`.
- `owner/page.tsx` — new `data-testid="owner-whole-business-plan"` section that fetches the route on business
  select and renders the DTO. Non-fatal if it fails (mirrors the control-center load).
- Refactor `owner-db-providers.ts`: extract `prefetchOwnerDomainRows` + `buildProvidersFromRows`;
  `buildOwnerDomainProviders` delegates (existing API + tests unchanged).

## 4. Fields from whole-business plan to render (with testids)
top priority (constraint + label), dominant constraint, next best action, what-not-to-do/stop list,
red/critical domains, owner-workload offload + delegated work + approval-required, proof required,
reassessment triggers, whole-business plan summary (7/30/90-day), cross-domain arbitration result,
growth/scale gate (scaleAllowed + blockedBy), stored-learning/provenance (applied + artifact ids/notes),
provider-backed data status + overall confidence + criticalDomainsRealProviderBacked, business stage,
collective score. The command-center summary is generated from the new runtime (`commandCenterSummary`).

## 5. DB/provider data required for browser proof
The seeded owner business (E2E workspace) must have persisted rows across the critical domains:
OwnerBusiness, OwnerCashflowSnapshot, OwnerFinancialSnapshot, OwnerWorkingCapitalItem,
OwnerCapacitySnapshot, OwnerComplianceItem, Proof, OwnerWorkloadSnapshot, OwnerStandingInstruction,
BehavioralLearningArtifact — i.e. `seedOwnerDbCase`. Extend `scripts/seed-e2e-owner.ts` to seed those rows
into the existing E2E owner workspace + archetype business so the route returns REAL-provider-backed output
and the learning artifact (workspace_private) is applied with provenance.

## 6. Playwright test coverage to add
`tests/browser/13-owner-whole-business-plan.spec.ts` — login as real OWNER → `/owner` → select the seeded
business → assert the new section renders: whole-business plan, top priority, dominant constraint, next best
action, do-not-do/stop, owner-workload/offload, proof required, reassessment trigger, growth/scale gate,
red/critical domains, stored-learning/provenance, provider-backed indicator; the page actually calls
`/api/owner/whole-business-plan`; no fatal console error; reload preserves state; mobile viewport renders it.

## 7. Expected final classification gates
`READY_FOR_REAL_WORLD_CASE_TRAINING` only if: new runtime surfaced in browser; browser renders whole-business
plan from the new runtime; top priority/do-not-do/owner-workload/proof/reassessment/domain/growth/arbitration
all visible; new Playwright E2E green; DB/provider proof green for the current commit (local postgres:16 +
CI); runtime ≥90, collective ≥90, holdout ≥88, adversarial unsafe 0, regression 0, all critical domains ≥90;
stored learning used; no cross-workspace leakage; no fake/harness-only path qualifies. Otherwise
`UI_RUNTIME_WIRING_READY` / `PLAYWRIGHT_WHOLE_BUSINESS_RUNTIME_READY` / `*_FAILED` honestly.

## Tests added
- `src/__tests__/services/owner-mode/owner-whole-business-plan.service.test.ts` — mock-Prisma unit tests
  (real-backed view; missing-data → low confidence + not real-backed; learning applied/provenance;
  fixture/missing cannot satisfy readiness).
- `src/__tests__/services/owner-mode/owner-context-derivation.test.ts` — pure derivation tests.
- `src/__tests__/services/owner-mode/owner-whole-business-plan.db.test.ts` — `[db]`-gated: seed → service →
  view fields + cross-workspace isolation (a second workspace sees no data).
- `tests/browser/13-owner-whole-business-plan.spec.ts` — the browser proof.

## Order of slices
1. Refactor providers (prefetch/build split) + context-derivation service + unit tests → commit.
2. Whole-business-plan service + route + unit tests + `[db]` test → commit.
3. Page wiring (new section) + extend e2e seed → commit.
4. Playwright spec 13 → run full owner suite + new spec → commit.
5. Re-run gates (tsc/eslint/runtime/provider/db/production-smoke/regression/classification) + report → commit + push.
