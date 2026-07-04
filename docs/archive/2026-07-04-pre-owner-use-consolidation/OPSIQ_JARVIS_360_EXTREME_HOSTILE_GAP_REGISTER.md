# OPSIQ JARVIS 360 — EXTREME HOSTILE GAP REGISTER

Read-only. Every claim re-verified against live code at HEAD `3019c40` — prior reports treated as
untrusted. Default stance: **not proven (runtime-wired + owner-visible + tested at the real path) = not done.**

- **Branch:** `claude/opsiq-jarvis-360-audit-m8jro7` · **HEAD:** `3019c40` · **Tree:** clean
- **Package manager:** npm. **CI:** `ci.yml` (in_progress on `3019c40`, run 28316829583), `lane-b-db-test.yml`.
- **Reports present:** all 7 expected (gap audit, continuous impl, CI proof, strict re-audit, complete
  register, complete closure, post-fix re-audit). None missing.

Severity: BLOCKER · CRITICAL · HIGH · MEDIUM · LOW. Status: OPEN · PARTIAL · CLOSED · E2E_ONLY · HARD_BLOCKED.

---

## Summary counts
- **Gaps: 28** — BLOCKER 2 · CRITICAL 5 · HIGH 9 · MEDIUM 10 · LOW 2.
- **Verified-closed positives (not counted as gaps): 2** (EH-13, EH-27).
- **By status:** OPEN 6 · PARTIAL 20 · E2E_ONLY 1 · CLOSED(genuine, owner-visible) 1 (EH-31 control center).

---

## Master table

| ID | Sev | Category | Finding (one line) | Proof level | Status |
|----|-----|----------|--------------------|-------------|--------|
| EH-01 | BLOCKER | runtime bypass | Safety-gate spine + arbitration run on the **consulting `Recommendation`** flow (via `consulting-engine/pipeline`), NOT owner-mode `OwnerAction`/`OwnerRecommendation` flows | backend enforced (wrong flow) | OPEN |
| EH-02 | CRITICAL | runtime bypass | Owner action-verify/complete routes (`/api/owner/{finance,cashflow,sop}/actions/[id]/verify`) import **no gate** → owner decisions promote ungated | route exists, ungated | OPEN |
| EH-03 | CRITICAL | owner-visible | `/api/owner/tasks/complete` (proof-gated completion) has **no UI caller** → owners cannot complete tasks in the app | backend enforced, invisible | PARTIAL |
| EH-04 | HIGH | approval/workload | `/api/owner/approvals/resolve` has **no UI caller** and no owner-mode client → workload-reduction path unreachable from the product | route exists, no caller | PARTIAL |
| EH-05 | CRITICAL | owner-visible | `arbitrateInterventions(...)` return is **discarded** (recommendation.ts:1366); chosen/rejected/what-not-to-do is audited only, never persisted or surfaced | backend, output dropped | PARTIAL |
| EH-06 | HIGH | seed/import | Laundry seed has **no route/import caller** → no runtime way to load the archetype; exists only in a DI test | helper only | PARTIAL |
| EH-07 | MEDIUM | staff-training | `deriveTrainingFromObservedFailure` has **no runtime caller** → training auto-trigger never fires | helper/test only | PARTIAL |
| EH-08 | MEDIUM | process-review | `triggerProcessReviewOnRepeatedFailure` has **no runtime caller** → never fires from a live failure counter | helper/test only | PARTIAL |
| EH-09 | HIGH | self-eval/memory | do-not-repeat consulted **only** inside the consulting promotion gate; owner-mode flows never consult it | backend (one path) | PARTIAL |
| EH-10 | HIGH | self-eval/memory | Self-eval writes do-not-repeat memory, but since owner-mode promotions don't consult it (EH-09), failed outcomes do **not** change future **owner-mode** recommendations | backend (one path) | PARTIAL |
| EH-11 | MEDIUM | proof/anti-gaming | Duplicate proof is rejected only at **completion**; at submit/review it is flag-only (status SUBMITTED) → a duplicate can be submitted + accepted | backend (completion only) | PARTIAL |
| EH-12 | MEDIUM | proof/anti-gaming | Proof freshness enforced only at `completeTask` (fixed 30-day default); review path ignores freshness; not per-requirement configurable | backend (completion only) | PARTIAL |
| EH-14 | CRITICAL | proof/anti-gaming | Proof-gated completion is **bypassable**: older owner action-verify routes mark actions verified/complete **without** proof clearance | route exists (bypass) | OPEN |
| EH-15 | HIGH | approval/workload | Legacy operator route does **not** pass ownerContext; no owner-mode flow calls resolve → measured workload reduction is **test-only at runtime** | test only | PARTIAL |
| EH-16 | MEDIUM | approval/workload | Batch approval, recurring-work detection, time-saved metric still **absent** (only attention disposition + handled count) | missing | OPEN |
| EH-17 | HIGH | SOP/checklist | SOPs still have **no task/proof binding**; `isSopReusable`/`isSopStale` uncalled; reuse doesn't avoid re-approval anywhere live | model/route only | OPEN |
| EH-18 | MEDIUM | equipment/capacity | Capacity gate on consulting growth promotion only; not marketing/opportunity/contract; equipment data unseeded at runtime (EH-06) | backend (one path) | PARTIAL |
| EH-19 | HIGH | marketing/opp/contract | `screenOpportunity`/`screenContractQuote`/`shouldRunMarketing` reachable only via `/guardrails/screen` (hand-entered); no live decision calls them | helper/route only | OPEN |
| EH-20 | HIGH | compliance/risk | Compliance items not consulted by any decision; no block/defer or professional-review requirement surfaced to the owner | model/route only | OPEN |
| EH-21 | HIGH | self-eval | No automatic outcome capture on action completion (self-eval is manual via route); reassessment need **not** surfaced in the command center | route only | PARTIAL |
| EH-22 | CRITICAL | seed/simulation | No runtime seed/import (EH-06) → realistic owner loop cannot start from app/DB; only a DI test composes it; **no DB-level loop proof** | test only | PARTIAL |
| EH-23 | BLOCKER | Playwright/E2E | **0** browser owner flows executed; Playwright **actively excluded** in CI (`lane-b` hard-fails if browser tests run); new spec 06 not run | none | E2E_ONLY |
| EH-24 | MEDIUM | CI/test weakness | All new closure tests are DI/in-memory; **none** exercise a real route handler or real DB for the new code; no rendered-page assertion runs | test only | PARTIAL |
| EH-25 | MEDIUM | CI/test weakness | `material-gate-registry` regression is a **source-string grep**, not behavioral — a path can keep the symbol but neuter its effect and still pass | test weak | PARTIAL |
| EH-26 | LOW | CI/test weakness | `owner-loop-service` test mocks DB; no `[db]` variant proves the loop against migrated Postgres | test only | PARTIAL |
| EH-28 | MEDIUM | security/governance | `completeTask` emits `OWNER_TASK_COMPLETED` **outside** the FSM transaction → a crash between commit and audit loses the completion marker (transition audit still inside tx) | backend | PARTIAL |
| EH-29 | LOW | data-quality | Block-metrics counts over a fixed 30-day window → a workspace with only old blocks shows stale counts (could mislead) | backend | PARTIAL |
| EH-30 | MEDIUM | proof/anti-gaming | `completeTask` ownerOverride bypasses the proof gate; audited in payload but **no** high-visibility override event or owner-visible override log | backend | PARTIAL |
| EH-13 | — | proof/anti-gaming | **VERIFIED CLOSED:** submitter≠reviewer SoD (`/api/proof/review`) + performer self-approval block at completion (FSM) hold | backend enforced | CLOSED |
| EH-27 | — | security/governance | **VERIFIED CLOSED:** new queries workspace-scoped; routes use OWNER_VIEW/OWNER_MANAGE; 0 new governance findings; no new migrations | backend enforced | CLOSED |
| EH-31 | — | owner-visible | **GENUINELY CLOSED:** owner command center renders control panel (alerts/what-not-to-do/attention/section counts + live block metrics) and is fetched by `/owner` | command-center visible | CLOSED |

---

## Detail — BLOCKER & CRITICAL

### EH-01 (BLOCKER) — the safety/arbitration spine is on the wrong flow
Files: `src/services/recommendation.ts:720` (`enforceOwnerGatesForPromotion`), `:1366`
(`arbitrateInterventions`), `src/services/consulting-engine/pipeline.ts:132` (the only non-test caller of
`createRecommendationsFromInterventions`). Owner-mode services that drive the command center
(`owner-condition`, `owner-home`, `owner-now-view`, the per-domain `*/actions/*` routes) generate/promote
`OwnerAction`/`OwnerRecommendation` **without** touching `recommendation.ts`. **Impact:** cash/margin/
capacity/do-not-repeat/arbitration protect the consulting deliverable pipeline, not the owner's actual
co-pilot decisions. **Closure:** route owner-mode promotion through `enforceOwnerGatesForPromotion` (or an
owner-mode equivalent) + `arbitrateInterventions`. **Tests:** owner-action promotion blocked by cash/margin/
do-not-repeat; arbitration attached to owner recommendations. **Owner-visible:** blocked owner actions +
chosen/rejected shown.

### EH-02 (CRITICAL) — owner action-verify routes are ungated
Files: `src/app/api/owner/{finance,cashflow,sop}/actions/[actionId]/verify/route.ts` — none import a gate.
**Impact:** an owner can verify/advance a material action with no cash/margin/capacity/do-not-repeat check.
**Closure:** insert the gate in the action service these routes call. **Test:** verify blocked when cash-critical.

### EH-03 (CRITICAL) — proof-gated completion is owner-invisible
File: `src/app/api/owner/tasks/complete/route.ts` exists; **no** `fetch("/api/owner/tasks/complete")` anywhere
in `src/app`/`src/components`. **Impact:** the one real proof-to-completion gate is reachable only by direct
API; the owner cannot use it. **Closure:** a task list/complete UI calling the route. **Owner-visible:** the
block reason rendered.

### EH-05 (CRITICAL) — arbitration output is thrown away
File: `src/services/recommendation.ts:1366` — `await arbitrateInterventions(validatedWorkspaceId,
interventions);` (return ignored). The control center's `whatNotToDo` comes from the control-center composer
(data/finance/capacity), **not** arbitration. **Impact:** "chosen action + rejected alternatives +
reconsideration" is computed + audited but never persisted on the recommendation nor shown. **Closure:**
persist the arbitration summary on the recommendation/cycle and render it. **Test:** generated recommendation
carries the arbitration verdict; owner page shows rejected alternatives.

### EH-14 (CRITICAL) — completion gate bypassable via legacy action-verify
The proof-gated `completeTask` is one completion path; the per-domain `*/actions/[id]/verify` routes are an
older path that marks actions complete/verified **without** proof clearance. **Impact:** the anti-gaming
completion gate is optional — collusion/fake-completion proceeds via the older route. **Closure:** funnel all
completion through the proof-gated service, or add proof clearance to the action-verify services.

### EH-22 (CRITICAL) — no runtime seed/import; "loop" is a test
`buildLaundryArchetypeSeed`/`validateArchetypeSeed` have **no** route/import caller. The end-to-end "owner
loop" exists only in `owner-loop-service.test.ts` (DI, mocked DB), composing services directly rather than the
owner's real runtime path. **Impact:** no realistic simulation can run against app/DB; no DB-level loop proof.
**Closure:** an import endpoint/dev seed script that persists the archetype, then a `[db]` loop test through the
real owner-mode routes.

### EH-23 (BLOCKER) — zero browser proof, Playwright excluded
`lane-b-db-test.yml:127` hard-fails if `tests/browser/` ran; `ci.yml` runs vitest only. New spec
`06-owner-control-center.spec.ts` is not executed anywhere. **Impact:** no proof any owner flow works in a
browser. **Closure:** a dedicated Playwright CI job (build + start + seed) running the owner specs.

---

## Detail — HIGH (condensed)
- **EH-04** approvals/resolve unreachable from UI → workload reduction not exercised in the product.
- **EH-06** seed unwired (see EH-22).
- **EH-09/EH-10** do-not-repeat + self-eval memory only affect the consulting promotion path; owner-mode
  recommendations never consult memory → loop closure is single-path.
- **EH-15** workload reduction is test-only at runtime (no live caller passes ownerContext / calls resolve).
- **EH-17** SOP has no task/proof binding; reuse/stale uncalled.
- **EH-19** opportunity/contract/marketing screens never called by a live decision.
- **EH-20** compliance not consulted by decisions; no professional-review surfaced.
- **EH-21** no auto outcome-capture; reassessment-needed not surfaced in command center.

## Detail — MEDIUM/LOW (condensed)
- **EH-07/EH-08** training + process triggers defined but uninvoked.
- **EH-11/EH-12** duplicate/freshness enforced only at completion, not submit/review.
- **EH-16** no batch/recurring/time-saved.
- **EH-18** capacity gate single-path; equipment unseeded at runtime.
- **EH-24/EH-25/EH-26** DI-only tests; registry regression is a grep; no `[db]` loop.
- **EH-28** non-transactional completion audit.
- **EH-29** fixed-window block counts.
- **EH-30** ownerOverride bypass lacks a high-visibility override log.

---

## Verified-closed (positives)
- **EH-13** proof SoD (submitter≠reviewer; performer self-approval blocked at completion) — enforced + tested.
- **EH-27** workspace isolation + RBAC on new routes; 0 new governance findings; no new migrations.
- **EH-31** owner control center is genuinely rendered + owner-visible (the one unambiguous win of the pass).
