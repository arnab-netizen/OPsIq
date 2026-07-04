# OpsIQ Final UI Runtime Wiring + Browser Whole-Business Plan E2E — Report

## 1. Branch
`claude/opsiq-jarvis-360-audit-m8jro7`

## 2. Base HEAD
`8071811` (classification entering this phase: `PRODUCTION_DB_INGESTION_READY`)

## 3. Final HEAD
`bbc33e7` + this report commit on top.

## 4. Working tree status
Clean (temporary local Playwright config removed; tracked `test-results/`/`playwright-report/`/`artifacts/`
restored — only the source/test/report changes below are committed).

## 5. Files changed
**New**
- `src/services/owner-mode/owner-context-derivation.ts` — derive a typed `OwnerBusinessContext` from persisted rows.
- `src/services/owner-mode/owner-whole-business-plan.service.ts` — compose providers + context + learning → runtime view.
- `src/app/api/owner/whole-business-plan/route.ts` — canonical OWNER_VIEW, workspace-scoped GET.
- `src/__tests__/services/owner-mode/owner-context-derivation.test.ts` — pure derivation unit tests.
- `src/__tests__/services/owner-mode/owner-whole-business-plan.service.test.ts` — service unit tests (mock Prisma).
- `src/__tests__/services/owner-mode/owner-whole-business-plan.db.test.ts` — `[db]`-gated service proof.
- `tests/browser/13-owner-whole-business-plan.spec.ts` — browser proof of the new runtime (desktop, reload, mobile).
- `OPSIQ_FINAL_UI_RUNTIME_WIRING_PLAN.md`, `OPSIQ_FINAL_UI_RUNTIME_WIRING_E2E_REPORT.md` (this file).

**Changed**
- `src/services/owner-mode/owner-db-providers.ts` — split `prefetchOwnerDomainRows` + `buildProvidersFromRows`
  (`buildOwnerDomainProviders` delegates; API + existing tests unchanged); added a real `opportunity_contract`
  provider derived from persisted capacity+finance growth posture.
- `src/app/(authenticated)/owner/page.tsx` — new **"Whole-business plan (live runtime)"** card (pure rendering).
- `scripts/seed-e2e-owner.ts` — seed the cross-domain `owner-db-case` rows (LAST) into the E2E owner workspace+business.
- `scripts/seed-owner-db-case.ts` — scope seeded row ids per business (`rid(businessId,label)`) for `[db]` isolation.

## 6. Runtime-to-UI integration point
Browser `/owner` page → `GET /api/owner/whole-business-plan?businessId=…`
→ `getOwnerWholeBusinessPlan` → `prefetchOwnerDomainRows` + `buildProvidersFromRows` (real DB providers)
+ `deriveOwnerContext` (persisted state) + `new PrismaLearningStore(db)` → **`runOwnerAdvice`**
(advisor + cross-domain arbitration + whole-plan + collective scorer + workspace-private learning)
→ serializable `OwnerWholeBusinessPlanView` → rendered in the command-center card. Authorization is
enforced server-side in the canonical route (no permission/business logic in the page).

## 7. UI fields rendered (all asserted by the E2E)
Top priority (constraint + label), dominant constraint, next best action, what-NOT-to-do/stop list,
owner-workload/offload + delegated work + owner-approval-required, proof required, reassessment triggers,
growth/scale gate (scaleAllowed + blockedBy), cross-domain arbitration (winner + rejected count + approval),
critical/red domains + domains-assessed count, stored-learning provenance (applied + artifact count + notes),
provider-backed data indicator + overall confidence + plan score + business stage, and an expandable
whole-business plan summary (7/30/90-day).

## 8. Provider-backed DB data used
`OwnerBusiness`, `OwnerCashflowSnapshot`, `OwnerFinancialSnapshot`, `OwnerWorkingCapitalItem`,
`OwnerCapacitySnapshot`, `OwnerComplianceItem`, `Proof`, `OwnerWorkloadSnapshot`, `OwnerStandingInstruction`,
`BehavioralLearningArtifact` — all workspace/business scoped, read through the providers (REAL_DB /
REAL_DB_SERVICE). For the seeded business `criticalDomainsRealProviderBacked === true`.

## 9. Stored learning/provenance surfaced
The workspace-private `BehavioralLearningArtifact` (laundry / cash_margin_working_capital) is read by
`PrismaLearningStore`, applied by the advisor, and surfaced in the card as **"Stored learning applied: yes
(1 artifact)"** with the corrected-behaviour note. The browser E2E asserts the literal "stored learning
applied: yes". A second workspace gets none (isolation test).

## 10. Command center summary proof
`06` (existing control center) + `13` (new whole-business card) both render from the real backend; `13`
asserts the page actually calls `/api/owner/whole-business-plan` (not a mock) and that the runtime fields
render desktop + mobile and survive reload.

## 11. Playwright specs run
`06-owner-control-center`, `07-owner-server-rejection`, `08-owner-finance-budget-safety`, `09-owner-indicators`
(×2), `10-rbac-workspace` (×2), `12-owner-mobile-smoke`, **`13-owner-whole-business-plan` (×2 — NEW)**,
`owner-realistic-baseline`.

## 12. New Playwright spec name
`tests/browser/13-owner-whole-business-plan.spec.ts`.

## 13. Playwright pass/fail/skipped counts
**11 passed, 0 failed, 0 skipped** on a fresh server (real Chromium build 1194 via the pre-installed binary —
`playwright install` NOT run — real seeded postgres:16 backend). Note: the login route is rate-limited
(10 attempts / 15 min / IP, in-memory per process); repeated local re-runs exhausted it and produced
`waitForNavigation` timeouts on `authenticateUser` — an environment throttle, not a product/spec defect.
A server restart clears the in-memory counter; the clean run above is 11/11. CI starts each run with a
fresh process and uses `retries: 2`.

## 14. Browser flows covered
New-runtime whole-business plan end-to-end (top priority, dominant constraint, next action, do-not-do/stop,
owner-workload/offload, proof, reassessment, growth/scale gate, arbitration, critical domains, stored-learning
provenance, provider-backed indicator), the page calling the real governed route, reload-preserves-state, and
mobile viewport — plus the existing command center, proof gating, finance EMERGENCY budget, owner indicators,
RBAC/workspace isolation, mobile smoke and the realistic baseline.

## 15. Console/browser errors
None fatal on the critical flow (spec 13 asserts no client-side exception overlay and no
`Cannot read / is not a function / Hydration failed` console errors).

## 16. Mobile viewport result
Pass — the whole-business runtime summary (panel + top priority + next action) renders at 375×812.

## 17. DB proof status for current commit
**Local postgres:16 — GREEN for the current commit.** Real PostgreSQL 16 cluster, 98 migrations applied,
prisma generated, `TEST_WITH_DB=true`: full behavioral-validation + owner-mode services = **274 passed / 0
failed**, including the **4 new `owner-whole-business-plan.db`** tests and the 7 `real-db-ingestion.db` tests.
CI corroboration on this commit runs on push (the prior CI DB proof — run `28366401904` — is green on the
infrastructure; this push re-runs it with the new `[db]` test in the blocking lane).

## 18. Tests/checks run
`tsc --noEmit` (0), `eslint` changed files (0 new), `lint:ratchet` (PASS, 0 new debt),
`governance:scan:strict` (0 new), unit + `[db]` suites (274/274 with DB), production validation modes,
domain-competency, and the Playwright owner suite.

## 19. Production runtime score
**98.4** (≥90).

## 20. Collective whole-business score
**98.4** (≥90).

## 21. Holdout score
**98.6** (≥88).

## 22. Adversarial unsafe output count
**0**.

## 23. Regression failures
**0**.

## 24. Critical domains below threshold
**None** — all 15 critical domains = 100; 36/36 EXPERT_READY.

## 25. Remaining blockers
None blocking READY. CI re-run on this commit (with the new `[db]` test in the blocking lane) is in-flight as
corroboration; local postgres:16 already provides green DB proof for the current commit.

## 26. Final classification
**`READY_FOR_REAL_WORLD_CASE_TRAINING`**

All gates are met: the new production owner-advice runtime is surfaced in the browser command center; the
browser renders the whole-business plan from that runtime (top priority, do-not-do/stop, owner-workload/offload,
proof, reassessment, growth/scale gate, cross-domain arbitration, critical domains and stored-learning
provenance); the new Playwright E2E is green (11/11 owner specs, real Chromium + seeded postgres:16);
DB/provider proof is green for the current commit (274/274 with `TEST_WITH_DB` on real postgres:16, incl. the
new `[db]` service test); production runtime 98.4 / collective 98.4 / holdout 98.6 / adversarial unsafe 0 /
regression 0 / 15-of-15 critical domains 100 / 36-of-36 EXPERT_READY; stored learning is used by the
production output and surfaced in the browser; no cross-workspace leakage; and no fake/harness-only path can
satisfy the readiness signal (the provider-backed indicator is driven by real persisted records).

No PR opened (awaiting explicit authorization); not merged.
