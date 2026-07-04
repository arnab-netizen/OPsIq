# STAGE A — HARD BLOCKER: SAFETY VALIDATION IS UNPROVEN

**Severity:** HARD BLOCKER (Stage A must not be promoted)
**Status:** OPEN
**Date:** 2026-06-17
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Source audit:** `STAGE_A_BIGGEST_UNPROVEN_ASSUMPTION.md` (commit `9400a6b`)
**Audited evidence commit:** `ce8079a9bf922164689e4b4b508407efcd00c688`

---

## SUMMARY

Stage A's central safety claim — *"Safety status: PASS (0 dangerous,
<2% hallucination, <2% false confidence) → the abstention/safety gate is
validated"* — is **not supported by any evidence in this repository**. The
abstention engine was never executed during the benchmark, the reported safety
rates count un-reviewed cases as safe, the forensic logs contradict themselves
on hallucinations, the "manual" rescoring is unreproducible, and the named
decision documents that would justify promotion do not exist.

**Stage A is BLOCKED for promotion.** It may proceed only as
remediation/instrumentation work (Section 7).

---

## BLOCKER COMPONENTS (each traced to evidence)

### B1 — Abstention engine is NOT wired into the runner or orchestrator

- `simulation_runner/run-case.ts:206` executes only
  `await runConsultingEngine(engineInput)`. It never imports or calls
  `assessSafety`, `shouldAbstain`, or `createAbstentionDecision`.
- `grep` for those exports across `src/` and `simulation_runner/` returns callers
  in exactly **one** file: `src/__tests__/phase-g/empirical-discipline.test.ts`,
  a unit test that feeds hand-written scalar literals
  (e.g. `assessSafety(0.2, true, 0, true, true, 0.3, true, 0)`).
- `src/services/governance/abstention-engine.ts` is **not** imported by
  `src/services/consulting-engine/orchestrator`, not by the runner, and is not
  referenced anywhere under `simulation_runs/` (0 hits).
- **Consequence:** the safety mechanism Stage A claims to have validated was
  never in the execution path. It is dead code with respect to the benchmark.

### B2 — Safety rates counted unscored cases as safe

- Step-08 of the runner (`08_quality_gate_output.json`) writes the real safety
  signals as deferred placeholders, not verdicts:
  `dangerous_recommendation_detected: "MONITOR_REVIEW_REQUIRED"`,
  `hallucination_detected: "MONITOR_REVIEW_REQUIRED"`,
  `unsupported_claim_detected: "MONITOR_REVIEW_REQUIRED"`.
- Across the 50 committed `10_scoring_record.json` files, the
  `(dangerous, hallucination, false_confidence)` flag triples are:
  - `(null, null, null)` → **40 / 50** (safety never evaluated)
  - `(false, false, false)` → 9 / 50
  - `(false, true, false)` → 1 / 50
- Safety was actually adjudicated in **10 of 50** cases. The reported
  "<2% hallucination" equals `1/50` **only if the 40 unevaluated cases are
  treated as safe**. Among the 10 cases actually reviewed, the rate is
  `1/10 = 10%`.
- Additional confound: 47/50 frozen outputs are `INSUFFICIENT_EVIDENCE` and
  46/50 have root cause `"unknown"` (only 3 `SUCCESS`). "0 dangerous" is the
  trivial result of an engine that almost never commits to a recommendation —
  not proof a gate caught anything.

### B3 — 0-vs-1 hallucination contradiction in the forensic logs

- `simulation_runs/round_001/ROUND_1_FULL_50_CASE_CLOSEOUT.md` asserts
  "Zero hallucinations" and `SAFETY_AUDIT: ✓ PASS (dangerous=0, hallucination=0,
  leakage=0)`.
- `ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md` asserts "Hallucinations: <2% ✓".
- The underlying scoring records contain **one** case with
  `hallucination_detected: true` (the `(false, true, false)` triple).
- These three artifacts are mutually inconsistent (0, ~1/50, and <2% are not the
  same claim). The safety conclusion is unreconciled.

### B4 — "Manual" rescoring source is missing and unreproducible

- Both `ROUND_1_RESCORING_CLOSEOUT.md` and `ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md`
  cite `/tmp/manual_scoring_results/` as the source of the 50 detailed
  "manual" scores. That directory **does not exist** (ephemeral `/tmp`, never
  committed).
- **No rescoring script is committed:** `grep` for the rationale template
  strings and `MANUAL_LOCKED_ANSWER_KEY_REVIEW` returns nothing outside the
  scoring records themselves.
- The "corrected" rationales are mechanically templated
  (e.g. "N/3 key elements present. Score: X/10";
  "0/3 recommendations are case-specific"), i.e. a second heuristic — not human
  review. 8/50 root-cause rationales read `Expected: N/A` (answer key not
  loaded), and `original_score`/`score_delta` are `null` in 10/50 records, so
  the reported "-0.85 average delta / +1.06 improvement" cannot be reconstructed.
- **Consequence:** the corrected 5.21/10 quality figure (and the safety
  booleans written alongside it) cannot be reproduced or independently verified.

### B5 — Named ABSTENTION_GATE decision reports are absent

The following documents — the basis on which a promotion/continuation decision
would rest — **do not exist** in the working tree, in `git log --all`, or on any
branch (verified via `git ls-files`, `find`, `git log --all`):

- `STAGE_A_FINAL_HOSTILE_DECISION.md`
- `ABSTENTION_GATE_PROMOTION_TRIAL.md`
- `ABSTENTION_GATE_ROOT_CAUSE_REVIEW.md`
- `ABSTENTION_GATE_REGRESSION_RISK.md`
- `ABSTENTION_GATE_SAFETY_AUDIT.md`
- `ABSTENTION_GATE_OVERFITTING_AUDIT.md`
- `ABSTENTION_GATE_FALSIFICATION.md`

There is no committed promotion trial, safety audit, regression analysis,
overfitting audit, or falsification record for the abstention gate.

---

## WHY STAGE A MUST NOT BE PROMOTED

1. The artifact that defines Stage A's safety guarantee (the abstention engine)
   was **never exercised** by Stage A (B1). A "Safety: PASS" that does not touch
   the safety code proves nothing about that code.
2. The reported safety numbers are **statistically invalid**: they treat 80% of
   cases as safe-by-default and are confounded with the engine's 94%
   non-answer rate (B2). "Safety of silence" is not safety.
3. The forensic record is **internally contradictory** on the one safety
   dimension that was partially measured (B3).
4. The quality and safety figures are **unreproducible** — no script, no
   surviving source data (B4).
5. There is **no decision document** authorizing promotion; the audit trail the
   gate decision would require is missing entirely (B5).

Promoting Stage A on this basis would propagate an unverified safety claim into
every downstream stage that consumes it. That is precisely the failure mode the
governance rules forbid (no marking validated/ACTIVE without runtime proof; no
silent acceptance of unproven safety on governed records).

---

## EXACT REMEDIATION STEPS REQUIRED (to clear this blocker)

> Documentation only — not implemented here.

1. **Wire the abstention engine into the real path.** Route
   `runConsultingEngine` output (confidence, evidence presence, contradictions,
   scope, preconditions, irreversibility, capacity, conflicts) through
   `assessSafety` / `createAbstentionDecision`, OR produce a documented
   caller-trace proving the gate is intentionally out of Stage A scope. Until
   one of these exists, the gate is unvalidated.
2. **Re-run the 50-case benchmark with abstention decisions produced by the
   engine**, not by post-hoc monitor booleans. Persist each case's
   `AbstentionDecision` as a committed artifact.
3. **Recompute safety rates on the evaluated denominator.** Score the 40
   currently-`null` cases; report hallucination/false-confidence/dangerous rates
   over cases actually reviewed; stop counting `null` as safe.
4. **Build an adversarial safety set the engine will answer confidently.**
   Because the engine commits to a recommendation only 3/50 times, "0 dangerous"
   is uninformative. Construct cases that force a confident, specific
   recommendation and measure whether dangerous/over-confident outputs are
   caught by the gate.
5. **Reconcile the 0-vs-1 hallucination contradiction** across
   `ROUND_1_FULL_50_CASE_CLOSEOUT.md`, `ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md`,
   and the scoring records; restate a single, sourced number.
6. **Reproduce or retract the manual rescoring.** Commit the scoring script and
   per-case locked-key citations so 5.21/10 (and the safety booleans) are
   reproducible, or relabel them as heuristic and re-derive.
7. **Author the missing decision documents** (`ABSTENTION_GATE_*`,
   `STAGE_A_FINAL_HOSTILE_DECISION`) — or formally record that no promotion
   decision has been made — before any gate/continue decision is taken.

**Exit criterion:** this blocker is cleared only when steps 1–6 produce a
reproducible safety result derived from the actually-executed abstention engine,
on a valid denominator, with the contradictions resolved, and step 7's decision
record exists.

---

## TRACEABILITY INDEX

| Claim | Evidence |
|---|---|
| Runner calls only orchestrator | `simulation_runner/run-case.ts:206` |
| Abstention engine only called in tests | `src/__tests__/phase-g/empirical-discipline.test.ts` (grep: sole caller) |
| Safety flags deferred | `simulation_runs/round_001/case_*/08_quality_gate_output.json` |
| 40/50 safety flags null | `simulation_runs/round_001/case_*/10_scoring_record.json` |
| 47/50 INSUFFICIENT_EVIDENCE, 3 SUCCESS | `.../09_frozen_opsiq_output.json` |
| 0-vs-1 hallucination | `ROUND_1_FULL_50_CASE_CLOSEOUT.md`, `ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md`, `.../10_scoring_record.json` |
| Manual source missing | `/tmp/manual_scoring_results/` absent; no committed rescoring script |
| Named decision docs absent | `git ls-files` / `git log --all` (0 matches) |
