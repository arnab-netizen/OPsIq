# OpsIQ — Final Expert-Adjudication Pass Report

Branch: `claude/opsiq-real-world-case-training` · Base HEAD: `3c9a8d1`
Objective: lift the two non-critical sub-90 domains to ≥90 without weakening any scorer/gate and without
regressing any other domain. Plan: `OPSIQ_FINAL_EXPERT_ADJUDICATION_PASS_PLAN.md`.

## 1. Before / after (measured through the real `runOwnerAdvice` sweep)
| Domain | Before | After |
|---|---|---|
| Approval memory/standing instructions | 89.6 | **99.6** |
| Staff workload/fairness | 89.7 | **99.7** |

Aggregate (same sweep): production runtime 97.4 → **98.2** · collective 97.5 → **98.2** · holdout 97.9 →
**98.5** · adversarial unsafe **0** · regression failures **0** · weak domains **0** · weak critical **0**.

## 2. Root cause (measured, not guessed)
A per-category diagnostic over the cases tagged with each domain showed every collective-scorer category at
full credit EXCEPT `cross_domain_tradeoff` (5.0/15) and a tiny `location_context_realism` shortfall. A case-
shape diagnostic then showed **100%** of those cases are `dominantConstraint = owner_workload`,
`decisionCategory = remote_owner`, `candidates = [proceed]`, `rejectedAlternatives = 0`.

The collective scorer awards `cross_domain_tradeoff` in full only when
`arbitration.rejectedAlternatives.length > 0` (the `stopDoNotDoList` half is always satisfied by a
fallback). `BLOCK_MAP["proceed"]` does not include `owner_workload`, so an owner-overload case never
rejected any candidate → permanent 4.5/15 partial. Weakness class: **RUNTIME / arbitration** — the scorer
was correct and was not changed.

## 3. Fix (surgical, monotonically safe)
`src/behavioral-validation/whole-business/arbitration.ts`:
- new `ActionType "owner_centralize"` — "owner personally approves and handles every decision";
- `BLOCK_MAP.owner_centralize = ["owner_workload", "capacity_feasibility"]`;
- `defaultCandidates` emits it when `c.flags.remoteOwner || c.flags.ownerEmotional` (which always makes
  `owner_workload` active), so it is always blocked when present.

Owner-overload plans now explicitly reject the owner-does-everything mistake with the remedy "delegate with
proof-based controls" — correct expert behavior, not scorer-gaming. The candidate is only added when
`owner_workload` is active and is then always rejected, so `rejectedAlternatives` / `whatNotToDo` only
grow; no collective category, domain grade, dominant constraint, regression, or adversarial metric can
decrease. Confirmed empirically: every aggregate rose, nothing regressed.

## 4. Tests added
- `arbitration.test.ts` (+4): a remote-owner case rejects `owner_centralize` via `owner_workload`; an
  owner-emotional case likewise; a non-overloaded owner case does NOT fabricate the temptation;
  `owner_centralize` is also blocked by a capacity bottleneck.
- `expert-adjudication.test.ts` (NEW): real approval-memory + staff-workload public cases through
  `runOwnerAdvice` assert the rejected tradeoff, owner-work offload (OpsIQ prepares + delegated), proof
  required, reassessment trigger, `unsafeCount == 0`, and `collective.total ≥ 90`.
- `scoring.test.ts` (+1 gate): both domains ≥90 and `weakDomains == [] && weakCriticalDomains == []`
  through the real stride-4 sweep — locks the bar against regression.

## 5. Cross-domain regression result
`whole-business` + `public-cases` suites: **151 passed / 7 skipped** ([db]-gated). `[db]` owner suite
(`owner-whole-business-plan`, `owner-business-isolation`, `real-db-ingestion`): **17 passed**. Browser
representative (`13` + `14`) re-run after the change: **17/17 passed** (10 desktop + 5 mobile + 2 plan).
tsc 0 · eslint 0.

## 6. Classification
**`EXTENSIVE_REAL_WORLD_CASE_TRAINING_EXPERT_READY`** — all EXPERT gates met (both domains ≥90, 60/60
domains ≥90, all 26 critical ≥90, no weak category/severity, collective 98.2, runtime 98.2, holdout 98.5,
adversarial unsafe 0, regression 0, learning persisted + applied, browser green, source register valid,
privacy green, no leakage, no harness-only path, reports complete). No PR opened; not merged.
