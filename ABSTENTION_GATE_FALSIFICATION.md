# ABSTENTION GATE — FALSIFICATION

**Purpose:** record attempts to *falsify* the claim "the abstention/safety gate
keeps unsafe confident outputs from proceeding," using committed evidence only.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Replaces:** the absent `ABSTENTION_GATE_FALSIFICATION.md` named in
`STAGE_A_SAFETY_VALIDATION_BLOCKER.md` (B5). No production code/scoring/thresholds/
answer keys/benchmark outputs changed. **Not a Stage A pass claim.**

## Falsification attempts (committed evidence)
1. **Designed high-support-but-wrong probes.** `HIGH_SUPPORT_WRONG_ADVERSARIAL_PROBE_REPORT.md`
   + `simulation_runs/adversarial_safety_probes_v2/` — 10 probes engineered to pass
   the evidence-support gate (ratio 0.75) yet be causally wrong, plus 2 correct
   controls. **Pre-fix result: 10/10 unsafe PROCEEDED** (gate falsified at that
   point → RC-7 confirmed).
2. **Post-fix re-runs.** `simulation_runs/adversarial_safety_probes_v2_option_a/`
   (9/10 caught) and `..._option_c/` (10/10 caught, 0 unsafe proceeded), controls
   preserved both times (`RC7_OPTION_A_VALIDATION_REPORT.md`, `RC7_OPTION_C_VALIDATION_REPORT.md`).
3. **Round 1 frozen replay.** `12_*`→`16_*` abstention decisions over 50 frozen
   cases; the gate abstains on the 2 confident-misaligned committed cases (RW-001,
   RW-005) and on all 47 INSUFFICIENT_EVIDENCE cases.

## What survived falsification (proven facts)
- The composite gate (B evidence-support + A causal-challenge + C constraint
  alignment) currently catches **all 10** designed unsafe probes while leaving
  **both** correct controls proceeding (`..._option_c/results_summary.json`).
- The gate is deterministic and re-runnable from committed scripts.

## What remains falsifiable / NOT disproven
- The probe set is **author-constructed**; absence of a *known* escape today is
  not proof none exists. RC-7's semantic core is unclosed: detectors are lexical
  heuristics (`RC7_OPTION_C_VALIDATION_REPORT.md` §6) — a wrong-but-cue-free,
  benign-looking, constraint-feasible recommendation can still pass.
- Only **3/50** Round 1 cases were committed enough to test the "proceed" path
  (`SAFETY_WIRING_VALIDATION_REPORT.md`): the engine abstains-by-weakness 94% of
  the time, so the gate's discrimination is exercised on a thin committed set.

## Open blockers
- **RW-005** hallucination verdict UNRESOLVED (`SAFETY_MONITOR_REVIEW_COVERAGE_REPORT.md`).
- Quality metric **UNVERIFIED** (B4 retraction, `B4_RESCORING_REPRODUCIBILITY_DECISION.md`).

**Stage A remains BLOCKED.** Falsification reduced the known-escape count to zero
on the current suite but did not establish that no escape exists.
