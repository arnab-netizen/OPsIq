# OPSIQ JARVIS 360 — OWNER FLOW POST-FIX AUDIT

Re-audit after the owner-flow closure pass. Honest, hostile, per-gap. Only **Slice 1** of the prompt's
12-slice plan was implemented to a genuine, tested standard this session; the rest remain OPEN/PARTIAL
(not stubbed — see §Scope note). HEAD at audit: `162442b` + Slice 1 commit.

## Scope note (transparency)
Two slices were implemented to a genuine, tested standard: **Slice 1** (owner-mode safety gate wired into
all 7 owner-domain action services — opt-out + do-not-repeat + capacity) and **Slice 2** (cash-safety
breadth — the gate now also enforces the proven `evaluateCashSafetyGate` over the owner's latest finance
survival + cashflow state). The remaining criticals (EH-05 arbitration persistence, EH-14 proof-binding to
owner actions, EH-22 runtime seed/import, EH-03/EH-04 owner UI) each require **schema and/or substantial UI
work**; rather than ship stubs/advisory shims (which CLAUDE.md and this prompt both forbid), they are left
explicitly OPEN with a concrete plan. This is an honest partial closure, not a completed one.

**Verify routes:** the `*/verify` endpoints RECORD before/after outcomes (measuring reality), not promote
risky actions — gating outcome-recording would be incorrect. The material gate correctly lives on the
status→in_progress/completed transition (gated in Slice 1+2). EH-02 is therefore CLOSED for the material
path; only owner-mode **margin** enforcement remains for EH-01.

## Per-gap verdicts

| Gap | Original finding | Closure (this session) | Runtime path now | Tests | Remaining bypass | Status |
|-----|------------------|------------------------|------------------|-------|------------------|--------|
| EH-01 | spine on consulting flow | owner-action gate (opt-out + do-not-repeat-by-scope + capacity + **cash safety**) wired into all 7 owner-domain `update*Action` services | owner action PATCH status→in_progress/completed → `enforceOwnerActionGates` | `owner-action-gate.test.ts` (11) + registry (11) | owner-mode **margin** not yet enforced | **PARTIAL (mostly closed)** |
| EH-02 | action-verify routes ungated | the action status/completion path is now gated; verify endpoints record outcomes (not promotions) by design | as above | as above | none for the material path | **CLOSED (material path)** |
| EH-09 | do-not-repeat one path | owner-action gate consults do-not-repeat by `scope:<domain>` | owner action → gate → rule lookup | gate test (scope block + override) | — | **CLOSED** (owner-mode path) |
| EH-18 | capacity gate one path | capacity gate now enforced on all growth-sensitive owner domains (marketing/sales/strategy/operations) | owner action → gate → `assessFleetCapacity` | gate test (capacity block) | marketing/contract *decision* (opportunity scoring) still separate | **CLOSED** (action path) |
| EH-03 | tasks/complete no UI | — | — | — | unchanged | **OPEN** |
| EH-04 | approvals/resolve no UI | — | — | — | unchanged | **OPEN** |
| EH-05 | arbitration discarded | — | — | — | unchanged | **OPEN** |
| EH-06 | seed unwired | — | — | — | unchanged | **OPEN** |
| EH-10 | self-eval memory one path | partially improved: owner-action gate now consults do-not-repeat, so a `scope:<domain>` caution recorded by self-eval WILL block owner actions; auto outcome-capture still missing (EH-21) | gate consults memory | gate test | self-eval not auto-invoked on owner completion | **PARTIAL** |
| EH-07,08 | training/process triggers uninvoked | — | — | — | unchanged | **OPEN** |
| EH-11,12 | duplicate/freshness at submit/review | — | — | — | unchanged | **PARTIAL** (completion-only, as before) |
| EH-14 | completion bypass via action-verify | — (owner action completion still requires only completionEvidence, not the proof FSM) | — | — | unchanged | **OPEN** |
| EH-15,16 | workload reduction test-only | — | — | — | unchanged | **PARTIAL/OPEN** |
| EH-17 | SOP no task/proof binding | — | — | — | unchanged | **OPEN** |
| EH-19 | marketing/opp/contract advisory | partially: growth-domain *actions* now capacity/do-not-repeat gated, but opportunity/contract *scoring* still query-only | — | — | dedicated screens uncalled | **PARTIAL** |
| EH-20 | compliance label-only | — | — | — | unchanged | **OPEN** |
| EH-21 | no auto outcome capture | — | — | — | unchanged | **OPEN** |
| EH-22 | seed test-only | — | — | — | unchanged | **OPEN** |
| EH-23 | 0 browser proof | — | — | — | unchanged | **E2E_ONLY_REMAINING** |
| EH-24,25,26 | DI-only tests / grep registry / no [db] | EH-25 improved (behavioral gate tests back the registry); EH-24/26 unchanged | — | gate behavioral tests | — | **PARTIAL** |
| EH-28,29,30 | minor governance/data | — | — | — | unchanged | **OPEN** |

## Summary
- **Genuinely closed this session:** EH-09, EH-18 (owner-mode path). 
- **Materially advanced (PARTIAL):** EH-01, EH-02, EH-10, EH-19, EH-25.
- **Still OPEN:** EH-03, EH-04, EH-05, EH-06, EH-07, EH-08, EH-14, EH-17, EH-20, EH-21, EH-22, EH-28, EH-29, EH-30.
- **PARTIAL (pre-existing):** EH-11, EH-12, EH-15, EH-16, EH-24, EH-26.
- **E2E-only:** EH-23.

**Non-E2E gaps remain OPEN — closure is incomplete.** The single most important fix (owner-mode is no
longer ungated) is in and tested, which is a real improvement over the prior state, but the prompt's
slices 2–12 are not done.

## Required next implementation order (unchanged from the audit, minus what's done)
1. Extend the owner-action gate with cash/margin (owner finance snapshot) + gate the `*/verify` routes (finish EH-01/EH-02).
2. Bind owner action completion to the proof FSM / proof clearance (EH-14, EH-17).
3. Persist + surface the arbitration verdict; auto-capture outcomes into self-eval (EH-05, EH-21).
4. Add owner UI action controls for complete/approve (EH-03, EH-04).
5. Add a dev/test-guarded seed/import route that persists the archetype + a `[db]` owner-loop test (EH-22, EH-06, EH-26).
6. Invoke training/process triggers from live sources; wire marketing/opportunity/contract + compliance into live decisions (EH-07,08,19,20).
7. Add a Playwright CI lane (EH-23).
