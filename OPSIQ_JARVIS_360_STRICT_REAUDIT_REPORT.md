# OPSIQ JARVIS 360 — STRICT POST-IMPLEMENTATION HOSTILE RE-AUDIT

Read-only. No source/tests/migrations/workflows modified. Verifies runtime wiring against
the actual code — does not accept docs, tests, or branch claims at face value.

- **Branch:** `claude/opsiq-jarvis-360-audit-m8jro7` · **HEAD:** `68f8ed0` · **Working tree:** clean
- **Inputs read:** the 3 prior reports (all present), the PR #54 diff (81 files: 10 migrations, 20
  test files, 12 routes, 36 domain/service, 1 schema, 2 reports), and the live code.

---

## 1. EXECUTIVE VERDICT

PR #54 is **real, compiles, migrates, and is CI-green** — but its value is concentrated in **one
genuinely-enforced runtime path**: the **safety-gate spine on the consulting `Recommendation`
promotion** (`PATCH /api/recommendations/[id]` → `updateRecommendation` when status→approved →
`enforceOwnerGatesForPromotion`), plus the **submitter≠reviewer proof check** on `POST /api/proof/review`.
Everything else is a **foundation of models/services/thin routes that is API-only, not wired into any
owner flow, not owner-visible, and fed entirely by hand-entered data.**

Concretely, the hostile-philosophy suspicions are largely **confirmed**:
- The safety gates enforce on the **consulting `Recommendation`** model, **not** the owner-mode
  `OwnerRecommendation`/`OwnerAction` flows that are the actual owner co-pilot surface.
- The proof-to-completion gate + performer≠approver SoD live in `planTaskTransition`, but
  **`applyTaskTransition` has zero runtime callers** → that gate is **test-only**.
- **11 of 12 new owner routes have no UI caller**; the new command-center panel and the Slice-1
  `dataSufficiency` field are **computed but never rendered**.
- **Approval memory is never consulted by the live `requestApproval` flow** → owner workload is
  **not reduced**; primitives only.
- SOP/training/equipment/process/marketing/opportunity/contract/arbitration/self-eval/compliance are
  **service-or-route-only**, fed by hand-entered signals, with **no auto-derivation and no loop closure**.
- **Playwright covers 0/16 owner flows and is not in CI.**

## 2. CURRENT CLASSIFICATION (strict)
**SAFETY_SPINE_CI_PROVEN_ONLY.** (A broader owner-control-platform *foundation* of models/services/
routes also exists and is CI-proven to compile+migrate+unit-test, but it is API-only, not wired into
owner flows, and not owner-visible — so it does not elevate the rating. See §20.)

---

## 3. ORIGINAL BLOCKERS — RE-AUDIT (PASS requires runtime enforcement + tests, not "added")

| # | Original blocker | Verdict | Evidence / why |
|---|---|---|---|
| 1 | No operational entity layer | **PARTIAL** | New models: `OwnerEquipment`, `OwnerStaffSkill`, `OwnerTrainingRecommendation`, `OwnerSopDocument`, `OwnerProcess`, `OwnerComplianceItem`. Still missing Customer, Complaint, Checklist-as-entity (steps are `string[]`). Models are service/route-only, not owner-visible. |
| 2 | Safety gates default-off | **PASS (one path)** | `gate-enforcement-policy.ts` default-on; enforced at `recommendation.ts:719`; CI-green DB suite. **Caveat:** only the consulting `Recommendation` promotion path. |
| 3 | Proof anti-gaming broken | **PARTIAL** | submitter≠reviewer is wired+enforced+audited on `POST /api/proof/review` (CLOSED). Proof-to-completion gate + performer≠approver are in `planTaskTransition`, but `applyTaskTransition` has **no runtime caller** → test-only. |
| 4 | No workload reduction | **FAIL** | `approval-memory.service.ts` exists but the live `requestApproval` (`workflow.ts:173`) **does not consult it**. No batch, no recurring detection, no real time-saved. Primitives only. |
| 5 | No runtime cross-module constraint gating | **PARTIAL** | Gates compose (cash→margin→capacity→do-not-repeat) on the consulting promotion only; owner-mode action/recommendation flows are **not** gated. |
| 6 | SOP lifecycle count-based | **PARTIAL** | Real versioned `OwnerSopDocument` lifecycle service exists, but **no linkage to tasks/proof/approval**; `isSopReusable`/`isSopStale` are never called; not owner-visible. |
| 7 | No equipment/capacity gate | **PARTIAL** | Capacity gate **is** wired on GROWTH-sensitive promotion (real). But no maintenance/downtime cost model (fields only), utilization is a static owner-entered field, equipment-free workspaces pass. |
| 8 | Self-eval loop not closed | **FAIL** | `recordSelfEvaluation` persists + classifies, but **nothing reads it to change future recommendations**; no cross-wire to do-not-repeat. Records only. |
| 9 | No contract/quote guardrails; scoring uncalled | **PARTIAL/FAIL** | `screenOpportunity`/`screenContractQuote`/`shouldRunMarketing` exist as pure functions reachable **only** via `POST /api/owner/guardrails/screen`; **no decision flow calls them**. Owner hand-enters all inputs. |
| 10 | Compliance routing aspirational | **PARTIAL** | `classifyComplianceRisk` + `OwnerComplianceItem` + route exist; COMPLIANCE_SENSITIVE routing in the input-quality gate exists — but compliance items are **not consulted** by any recommendation/decision flow. |

**Score: 1 PASS(one-path), 6 PARTIAL, 2 FAIL** (blocker 3 split).

---

## 4. ORIGINAL LOOPHOLES — RE-AUDIT

| # | Loophole | Status | Notes |
|---|---|---|---|
| 1 | Submitter==reviewer self-approves proof | **CLOSED** | `reviewProof` reads `submittedByUserId` in-tx, throws `ProofSelfReviewError`; wired (`/api/proof/review`), audited, tested. |
| 2 | Task complete without accepted proof | **PARTIALLY_CLOSED** | FSM denies it, but `applyTaskTransition` is unrouted → not enforced at runtime; STILL_OPEN on any live completion path. |
| 3 | No proof freshness | **STILL_OPEN** | Not implemented (documented follow-on). |
| 4 | Duplicate proof flagged not rejected | **STILL_OPEN** | `submitProof` still only sets `duplicateFlagged`; no rejection. |
| 5 | Growth/spend while cash-critical | **PARTIALLY_CLOSED** | Default-on cash gate blocks on the consulting promotion; owner-mode flows ungated. |
| 6 | Discount below margin not blocked | **PARTIALLY_CLOSED** | Margin gate blocks PRICING_SENSITIVE on consulting promotion; owner-mode/pricing-entry ungated. |
| 7 | Approval re-asks (weak keying) | **STILL_OPEN (live flow)** | Content-hash memory exists but the live `requestApproval` never calls `isApprovalRemembered`. |
| 8 | Capacity RED advisory only | **PARTIALLY_CLOSED** | Capacity gate blocks growth on consulting promotion; otherwise still advisory. |
| 9 | do_not_repeat persisted not checked | **PARTIALLY_CLOSED** | `enforceDoNotRepeatForPromotion` checks it on consulting promotion; owner-mode flows ungated. |
| 10 | Command center serves stale numbers, hidden | **PARTIALLY_CLOSED** | `dataSufficiency`/`dataSufficiencyStatus` are **computed but never rendered** by any owner page → still hidden from the owner; backend exposes it, UI does not. |

**1 CLOSED, 6 PARTIALLY_CLOSED, 3 STILL_OPEN.**

---

## 5. STRICT CAPABILITY SCORING (0–12 scale)

| Capability | Score | Level | Justification |
|---|---|---|---|
| Default-on safety gates (cash/input/business-impact/confidence) | **7** | BACKEND_WIRED_ENFORCED | Enforced at `recommendation.ts` promotion; not owner-visible (no UI). |
| Margin gate (Slice 2) | **7** | BACKEND_WIRED_ENFORCED | Same path; PRICING_SENSITIVE only. |
| Capacity gate (Slice 7) | **7** | BACKEND_WIRED_ENFORCED | Same path; GROWTH_SENSITIVE only; data manual. |
| do-not-repeat (Slice 12) | **7** | BACKEND_WIRED_ENFORCED | Same path. |
| Proof submitter≠reviewer (Slice 3) | **7** | BACKEND_WIRED_ENFORCED | `/api/proof/review`. |
| Proof-to-completion gate / performer≠approver | **4** | TEST_ONLY | `applyTaskTransition` unrouted. |
| Data-sufficiency disclosure (Slice 1) | **6** | BACKEND_WIRED_ADVISORY_ONLY | Computed in summary/profile; **not rendered** → not score 8. |
| Owner command-center panel (Slice 9) | **5** | ROUTE_EXISTS_NOT_USED | `/api/owner/control-center` exists; owner page renders the *old* command-center, not this. |
| Approval memory (Slice 4) | **5** | ROUTE_EXISTS_NOT_USED | Live approval flow ignores it. |
| Standing instructions / attention budget (Slice 4) | **5** | ROUTE_EXISTS_NOT_USED | Recorded; not consulted by any action/approval flow. |
| SOP document lifecycle (Slice 5) | **5** | ROUTE_EXISTS_NOT_USED | No task/proof linkage; not owner-visible. |
| Staff training / skills matrix (Slice 6) | **5** | ROUTE_EXISTS_NOT_USED | Evidence hand-entered; no auto-trigger; not visible. |
| Equipment record (Slice 7) | **6** | wired via capacity gate | Feeds the gate; record route API-only. |
| Process review (Slice 8) | **5** | ROUTE_EXISTS_NOT_USED | Signals hand-entered; no scheduler; not visible. |
| Decision arbitration (Slice 10) | **3/5** | HELPER_ONLY / ROUTE_EXISTS_NOT_USED | Pure `arbitrate`; reachable only via `/api/owner/arbitrate`; no recommendation flow calls it. |
| Marketing/opportunity/contract guardrails (Slice 11) | **3/5** | HELPER_ONLY / ROUTE_EXISTS_NOT_USED | Pure screens; only via `/guardrails/screen`. |
| Self-evaluation (Slice 13) | **5** | ROUTE_EXISTS_NOT_USED | Records only; loop not closed. |
| Compliance boundary (Slice 14) | **5** | ROUTE_EXISTS_NOT_USED | Not consulted by any decision flow. |

No capability scores ≥ 8 (none owner-visible/E2E-proven). Highest = 7 (a handful of enforced gates).

---

## 6. RUNTIME PATH TRACE (key flows)

| Flow | Entry → chain → enforcement | DB / audit | Owner-visible? | Bypass / gap |
|---|---|---|---|---|
| A. Command-center state | `/api/owner/command-center` → `getBusinessCondition` → `buildBusinessConditionProfile` | reads cycles | partial (old profile fields) | new `dataSufficiency` + control-center panel not rendered |
| B/C/D. Marketing/opportunity/quote/discount | **No automatic flow.** Only `POST /api/owner/guardrails/screen` with hand-entered inputs | none | no | guardrails never consulted by a decision path; margin/capacity blocked only via consulting promotion |
| E–H. Staff completes task / proof submit / review / completion approve | submit `/api/proof/submit`→`submitProof`; review `/api/proof/review`→`reviewProof` (SoD enforced); **completion: `applyTaskTransition` unrouted** | Proof table + audit | no UI proven | completion gate test-only; freshness/dedupe-reject absent |
| I/J. SOP create/approve/reuse; checklist→task/proof | `/api/owner/sop-documents` → `sop-document.service` | OwnerSopDocument + audit | no | no link to tasks/proof; reuse/stale checks uncalled |
| K. Training from observed gap | `/api/owner/staff-training` (manual evidence) | models + audit | no | evidence hand-entered; no auto-trigger; no effectiveness recheck |
| L. Equipment/capacity gate | `recommendation.ts`→`enforceOwnerGatesForPromotion`→`enforceCapacitySafetyForPromotion` | OwnerEquipment | no | GROWTH only; consulting path only; data manual |
| M. Process review | `PATCH /api/owner/processes` (manual signals) | OwnerProcess + audit | no | no scheduler/auto-derive |
| N. do_not_repeat suppression | consulting promotion gate | OwnerDoNotRepeatRule + audit | no | owner-mode flows ungated |
| O. Self-eval after outcome | `POST /api/owner/self-evaluation` (manual) | OwnerSelfEvaluation + audit | no | does not change future recs |
| P. Compliance/professional review | `/api/owner/compliance` + input-quality COMPLIANCE_SENSITIVE routing | OwnerComplianceItem + audit | no | items not consulted by decisions |
| Q. Arbitration | `POST /api/owner/arbitrate` (manual candidates) | none | no | not called by recommendations |
| R. Owner attention/load summary | `getOwnerControlCenter` (aggregates) | counts | **no (not rendered)** | panel discarded by UI |

---

## 7. TEST QUALITY AUDIT
- 17 of 18 new/modified files = **STRONG_SERVICE_PROOF (DI + mocked `db`/audit)** or **HELPER_PROOF (pure)**.
- `jarvis-360-adversarial.test.ts` = **TEST_ONLY_NO_RUNTIME_PROOF** — pure-domain composition; imports only `@/domain/*`; **zero** service/route/DB calls. It proves the *helpers* produce safe outcomes, **not** that the runtime enforces them.
- **No test** exercises the real promotion route (`updateRecommendation` status→approved) end-to-end; **no test** hits a real DB for the new code (all DI-mocked).
- Local: **237 passed**; 2 `*.db.test.ts` fail only on the missing generated Prisma client (environmental). CI run `28313889699` (`0e462a8`) was fully green incl. the DB suite — but that suite is the **pre-existing** owner-mode DB tests, not a new gate-on-promotion test.
- **Verdict:** tests prove isolated helpers + DI services; they do **not** prove runtime enforcement on owner flows.

## 8. OWNER WORKLOAD REDUCTION AUDIT
- Approval memory: content-hash ✓, scope ✓, risk class ✓, expiry ✓, cross-workspace blocked ✓, material-change ✓ — but **never reused in the live `requestApproval` flow**.
- Standing instructions ✓ stored/owner-only; **not used** by any action/approval path.
- Batch approvals: domain partitioner only; **no route/flow**. Recurring detection: **missing**. Time-saved: **missing**. Alert-fatigue: classifier only, **not surfaced**.
- Command center: does **not** render "what OpsIQ handled / what to ignore."
- **Classification: PRIMITIVES_ONLY.**

## 9. SOP / TRAINING / EQUIPMENT / PROCESS AUDIT
- **SOP:** SERVICE_ONLY (no task/proof linkage; reuse/stale uncalled; not visible).
- **Training/Skills:** SERVICE_ONLY (evidence hand-entered; no auto-trigger; no effectiveness loop; `sopId` unused).
- **Equipment/Capacity:** RUNTIME_WIRED (capacity gate, growth only) + MODEL_ONLY maintenance/downtime (fields, no model).
- **Process:** MODEL_ONLY/ROUTE_ONLY (manual signals; no scheduler; no actionable output).
- None are COMMAND_CENTER_VISIBLE or E2E_PROVEN.

## 10. BUSINESS OUTCOME AUDIT
Supported **automatically** today: "Can I afford this?" (cash gate) and "Can we fulfill this?" (capacity gate) — **on the consulting promotion path only**. Everything else ("what should I do today / not do", "what marketing", "accept this opportunity / is this quote profitable", "which staff/process/equipment", "what work did OpsIQ remove", "did the last rec work") is **query-only / manual-input / not owner-visible**. No question is answered through a rendered owner UI built by this PR.

## 11. PLAYWRIGHT / BROWSER E2E GAP
- **0 / 16** owner flows covered. **0 / 12** new owner routes appear in any browser test.
- Playwright is **configured but not in CI** (`ci.yml` runs vitest only; lane-b explicitly excludes it).
- Required plan: §17.

## 12. REALISTIC SIMULATION READINESS
- Laundry: **DATA_MODEL_READY.** Housekeeping: **DATA_MODEL_READY.**
- All 9 new models are **generic**; no archetype SOP/equipment/staff/process/training **seed templates**; owner must hand-populate everything. No fixture businesses. Not SERVICE_SIMULATION_READY.

## 13. SECURITY / GOVERNANCE REGRESSION
- Raw-error-message in audit payload → **caught + fixed** by CI governance (commit `d425dae`).
- Workspace isolation preserved (all new queries workspace-scoped; routes enforce OWNER_VIEW/OWNER_MANAGE).
- Owner override controlled + audited (gate opt-out, SOP/compliance owner-only).
- No cross-workspace leakage, no client-only enforcement, no missing audit on mutations, no duplicate engines, no billing/SaaS scope, migrations additive.
- **Caveat:** orphaned/thin schema — `OwnerDecisionMemory` remains un-migrated (pre-existing; correctly avoided), and several **new tables are minimally used** (added but only via thin routes).
- **Classification: LOW_RISK.**

## 14. REMAINING GAPS (top 10)
1. Owner-mode (`OwnerRecommendation`/`OwnerAction`) flows are **not gated** by the safety spine.
2. Proof-to-completion gate is **test-only** (`applyTaskTransition` unrouted); no proof freshness; duplicates flagged-not-rejected.
3. Approval memory / standing instructions **not consulted** by the live approval flow → no real workload reduction.
4. New command-center panel + `dataSufficiency` **not rendered** → owner can't see safety/staleness/blocks.
5. Marketing/opportunity/contract/arbitration guardrails **never called** by a decision flow (query-only).
6. SOP documents have **no task/proof/checklist linkage**; reuse/stale checks uncalled.
7. Training & process signals are **hand-entered**; no auto-derivation from complaints/quality/proof; no scheduler.
8. Self-evaluation **does not change future recommendations** (loop open).
9. **0 Playwright** owner-flow coverage; not in CI.
10. No archetype **seed templates / fixtures** → no realistic owner simulation.

## 15. NEW RISKS (top 10, all LOW unless noted)
1. False confidence from "ALL_SLICES_IMPLEMENTED_CI_PROVEN" — CI proves compile/migrate/unit, **not** owner-flow enforcement (MEDIUM as a *governance* risk).
2. Several new tables minimally used (lightly-dead schema).
3. Owner could assume gates protect owner-mode decisions (they protect the consulting promotion).
4. Owner could assume the command center shows safety/staleness (it doesn't render them).
5. Owner could assume approvals stop repeating (they don't — memory unused).
6. Completion-gate code present but inert → reviewers may believe completion is proof-gated.
7. Guardrail routes invite manual misuse (owner self-reports inputs).
8. Self-eval data accumulates without consumption.
9. Playwright excluded from CI → UI regressions invisible.
10. CI flakiness on the DB suite (one infra flake observed on `68f8ed0`).

## 16. REQUIRED NEXT IMPLEMENTATION ORDER
1. **Wire the gate spine into owner-mode** action/recommendation promotion (so cash/margin/capacity/do-not-repeat/input-quality gate the actual owner decisions, not just consulting `Recommendation`).
2. **Route `applyTaskTransition`** behind a completion endpoint and populate `proofRequired`/`proofCleared` from live proof status → make the completion gate real; add freshness + duplicate-reject.
3. **Consult approval memory + standing instructions in `requestApproval`** → real workload reduction; add time-saved counting.
4. **Render** the control-center panel + `dataSufficiency` (+ "handled / ignore / what-not-to-do") on the owner command center.
5. **Call the guardrail screens + arbitration** from the marketing/opportunity/quote and recommendation paths.
6. **Auto-derive** training/process signals from complaint/quality/proof data; add a scheduler for process/SOP review.
7. **Close the self-eval loop** (feed failures into do-not-repeat + future ranking).
8. **Link SOP documents** to tasks/proof requirements; consult reuse/stale.
9. **Add archetype seed templates + fixtures** (laundry, housekeeping).
10. **Add Playwright owner-flow specs and wire Playwright into CI.**

## 17. REQUIRED PLAYWRIGHT PLAN (highest value first)
Owner login → command center renders data-sufficiency + safety alerts; safety-gate block visible;
stale-data warning visible; staff proof submit → manager review (self-review blocked) → completion
blocked until proof accepted; SOP draft→approve→reuse; training rec from observed gap visible;
equipment bottleneck blocks growth (visible); process review due alert; marketing/opportunity guardrail
reject visible; owner approval reuse (no re-ask); full owner decision→action→proof→reassessment loop.
**Wire Playwright into a CI lane.**

## 18. REQUIRED REALISTIC SIMULATION PLAN
Seed archetype templates (SOPs, equipment, staff roles, processes, training triggers) for laundry +
housekeeping; add demo fixture businesses with metrics; add an onboarding auto-populate path; then
DB-backed end-to-end simulation tests exercising the **wired** owner flows (after §16 items 1–8).

## 19. MERGE / HOLD RECOMMENDATION
PR #54 is **safe to merge as a CI-proven safety/foundation increment** (additive, isolated, no
regressions, LOW risk) — **provided the PR description is corrected** to claim only what is true:
a default-on safety-gate spine on the consulting promotion + proof-review SoD + a foundation of
owner-control models/services/routes that are **not yet wired into owner flows or owner-visible**.
Do **not** merge under the banner "owner operating co-pilot" / "all slices CI-proven" as owner-runtime
enforcement. **Recommendation: HOLD for description correction + a green HEAD re-run, then mergeable as a foundation increment.**

## 20. FINAL CLASSIFICATION
**SAFETY_SPINE_CI_PROVEN_ONLY** — strictest honest label. Only the safety-gate spine (consulting
promotion) + proof-review SoD are genuinely runtime-enforced and CI-proven. A broader
owner-control-platform *foundation* exists and is CI-proven to compile/migrate/unit-test, but it is
API-only, not wired into owner flows, and not owner-visible — so it does not reach
`OWNER_CONTROL_PLATFORM_FOUNDATION_CI_PROVEN` as an *operating* claim, and is far below
`SERVICE_LEVEL_SIMULATION_READY` / `BROWSER_E2E_READY` / `REALISTIC_OWNER_SIMULATION_READY`.
Not `OWNER_OPERATING_COPILOT_READY_FOR_PILOT`.
