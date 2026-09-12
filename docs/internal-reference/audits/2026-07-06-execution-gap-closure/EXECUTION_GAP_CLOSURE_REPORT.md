# PASS 19 — Execution Gap Closure — Plan (owner decision required)

## 1. PASS 18 classification
**EXECUTION_FIRST_LEVEL_3_PARTIAL_ADVISORY_GAPS_REMAIN** (see `../2026-07-06-execution-first-level-3-audit/`).
Safe (0 BLOCKED, no unsafe autonomy, no fabricated money), but ~10 major modules are advisory/monitoring-only with one CRITICAL honesty defect and multiple HIGH advisory gaps.

## 2. Why this pass is PLAN (not unbounded implementation)
The **dominant** remediation is to bridge the read-only process-intelligence cockpit into OpsIQ's real execution substrate (persist corrections / SOP drafts / training / workload / cash protective actions as governed owner/manager/staff tasks, and add the matching cockpit action affordances). That is a **broad** change — new persisted work-item flows, routes, UI, and tests across ~7 engines. The loop's hard limits are explicit: *"Do not implement broad new modules in PASS 19"* and *"If gaps are broad, stop and ask owner to approve the next remediation sequence."* Therefore this pass delivers a concrete, prioritized, ready-to-execute plan and escalates the sequencing decision to the owner. No production code is changed in this pass.

## 3. Gaps selected for the (owner-authorised) FIRST BOUNDED INCREMENT
These are small, safe, reversible, add no autonomy and no external action, and reuse existing services. Each is ready to implement on approval.

| ID | Fix | Files (approx) | Risk | Why safe/bounded |
|---|---|---|---|---|
| **C1** | Effectiveness must not claim "the correction appears to be working" without a verifiably-executed correction. Add an explicit `correctionExecuted` input (default false until the bridge lands); when false, the verdict is honest `NOT_ATTRIBUTABLE`/`INSUFFICIENT_DATA` with a neutral next-action. | `sop-training-effectiveness-loop.ts`, `owner-now-view.service.ts:1272-1283`, effectiveness DB sim + component test | Low | Removes a false causal claim; enforces the mandatory "no fabricated figures / honest DATA_INSUFFICIENT" rule. No new module. |
| **H4-precision** | Stop presenting `cashRunwayDays`/`netMarginPct` state-bucket constants as measured figures. Pass `null` metricValue (or a `tier` label) from the caller so the risk still surfaces with its severity but shows no invented day/percent number. | `owner-now-view.service.ts:72-73,584-585,1096-1114` (+ verify signal still fires with null) | Low-Med | Aligns the live caller with the domain contract ("metricValue is a REAL value the caller provided, else null"). |
| **H6** | On an overdue-severe complaint (and a complaint linked to an ACCEPTED proof), auto-emit a reassessment event / open a proof dispute using the **existing** `reassessment-event.service` / `disputeAcceptedProof`. | `complaint-rework.service.ts`, `operational-event-aging.ts` | Low-Med | Reuses existing governed, audited services; safe internal action, owner-visible; no autonomy over money/staff/legal. |
| **H8** | Add a two-populated-tenant cross-READ isolation DB test across the owner-mode read services. | new `sec-0X-cross-tenant-read.db.test.ts` | None | Test-only; closes the read-isolation proof gap. |
| **H9** | Replace `if (await panel.count())` no-op guards with deterministic seeds; add a browser journey that completes a task with evidence and approves an owner-approval item. | `tests/browser/44,45`, seeds | Low | Test-only hardening. |
| **H11** | Extend audit fault-injection (rollback-on-audit-failure) to the 5 remaining governed write services; add a hash-chain concurrency (no-fork) test. | new audit DB tests | None | Test-only; closes the atomicity proof gap. |
| **H7 (cleanup half)** | Either wire or **remove** the dead `verification-engine.ts` / `coordinateExecution`; if removed, document the "no automated post-completion KPI check" limitation honestly. | `verification-engine.ts`, `execution-coordinator.ts` | Low | Removing dead code is bounded; wiring is deferred to the broad phase. Also relieves a CLAUDE.md "no stubs/fake implementations" concern. |

## 4. Gaps NOT selected this pass (BROAD — owner must approve sequence)
| ID | Gap | Why broad |
|---|---|---|
| **H1** | Persist process corrections as governed owner/manager tasks | new work-item flow + lifecycle + endpoints + UI |
| **H2** | Bridge SOP correction drafts → `createSopDraft`/`approveSopDocument` + evidence-gated approval | new bridge + evidence gate + adherence verification |
| **H3** | Training `recommended→assigned` + expose `completeTraining` route (proof-of-completion) | new staff-task flow + route + UI |
| **H5** | Route workload `CONVERT_TO_POLICY` → `recordStandingInstruction` | new routing + owner confirmation UI |
| **H10** | Cockpit approve/delegate/complete action affordances | depends on H1/H4; new interactive UI + mutations |
| **M1** | Governed capability-adoption decision track | new decision/track model |

These are the substance of "make the cockpit genuinely Level 3." They should be sequenced as a **separate, owner-approved remediation phase** (module by module, each with DB sim + browser proof), not folded into a single pass.

## 5. Recommended sequence (for owner approval)
1. **Increment 1 (bounded, this-pass-ready):** C1 → H4-precision → H6 → H7(remove dead code) → H8/H9/H11 (proof coverage). Honest + reuse + tests only.
2. **Increment 2 (broad, approve as a phase):** H1 process-correction task persistence + H10 cockpit action affordance (the highest-leverage bridge; makes the daily cockpit executional).
3. **Increment 3 (broad):** H2 SOP bridge, H3 training assign/complete, H5 workload→standing-instruction.
4. **Increment 4 (medium):** M2 adjudication auth scope, M3 anti-gaming path unification, M4/M5 opportunity nuances, M6 server-role resolution in multi-actor proof.

## 6. If Increment 1 is authorised — required per-fix loop
For each fix: source advisory-only gap → execution/honesty conversion → action owner (unchanged; no new autonomy) → evidence requirement (unchanged/added) → completion state → owner cockpit update → tests → DB sim if DB-backed → CI proof (`prisma validate/generate`, `tsc --noEmit`, `governance:scan:strict`, `lint:ratchet`, targeted + regression tests, `next build`).

## 7. Required commands (to be run when implementing)
`prisma validate` · `prisma generate` · `tsc --noEmit` · `governance:scan:strict` · `lint:ratchet` · targeted tests · regression tests · DB sim (local Postgres 16, as used in PASS 18) · browser E2E if applicable · `next build`.

## 8. Remaining advisory-only gaps after Increment 1
The cockpit would be **honest** (no false attribution, no false precision) and complaints/proof re-verification + isolation/audit proofs would close — but the cockpit would still be **advisory** for corrections/SOP/training/workload/cash until Increments 2–3 land. So the classification after Increment 1 alone would remain `PARTIAL_ADVISORY_GAPS_REMAIN` (honest-advisory, not yet executional).

## 9. Owner-use impact
- **Today (unchanged this pass):** OpsIQ is safe and usable; the material-risk loops (opportunity/proof/domain-actions) genuinely execute with owner/evidence gates; the process-intelligence cockpit is a diagnostic the owner must act on manually via the separate action forms. **Do not trust the effectiveness "IMPROVED" verdict or the cash runway-days/margin-% numbers** until C1/H4 land.
- **After Increment 1:** the cockpit stops making unsupported claims; complaints and proof contradictions auto-route to reassessment; isolation/audit are fully proven.
- **After Increments 2–3:** the cockpit becomes executional — corrections/SOP/training/workload/cash route into governed tasks the owner approves in one place.

## 10. CI status
No source changed in PASS 19 (plan artifacts only). PASS 17 verification (prisma/tsc/governance/lint/build) and the PASS 18 local DB run (49 tests) remain the current green baseline.

## 11. PR / merge status
Plan committed to `claude/opsiq-post-level3-hygiene-da04y4`. No PR/merge performed by this agent; awaiting owner direction on the remediation sequence (§5).

## 12. Final classification
**EXECUTION_GAP_CLOSURE_PLAN_ONLY** — bounded fixes are scoped and ready; the dominant remediation is broad and is escalated to the owner for sequencing per the loop's hard limit. No unsafe autonomy, no external integrations, no billing/SaaS/launch work introduced.

## 13. Exact next safest pass
**Owner authorises Increment 1** (bounded honesty + reuse + proof-coverage fixes) → implement + CI-gate + merge → then approve Increment 2 (the process-correction execution bridge) as its own module-scoped pass. Public SaaS, billing, Product Hunt, launch readiness, integrations, Local Mode, and enterprise/compliance hardening remain FROZEN.
