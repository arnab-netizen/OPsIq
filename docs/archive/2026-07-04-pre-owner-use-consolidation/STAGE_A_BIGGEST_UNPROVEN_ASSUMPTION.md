# STAGE A — BIGGEST UNPROVEN ASSUMPTION (Hostile Audit)

**Mode:** HOSTILE AUDIT — trust no prior conclusion.
**Date:** 2026-06-17
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Audited commit:** `ce8079a9bf922164689e4b4b508407efcd00c688`

---

## 0. PRELIMINARY: THE REQUESTED INPUT DOCUMENTS DO NOT EXIST

The task instructed me to read seven decision documents:

```
STAGE_A_FINAL_HOSTILE_DECISION.md
ABSTENTION_GATE_PROMOTION_TRIAL.md
ABSTENTION_GATE_ROOT_CAUSE_REVIEW.md
ABSTENTION_GATE_REGRESSION_RISK.md
ABSTENTION_GATE_SAFETY_AUDIT.md
ABSTENTION_GATE_OVERFITTING_AUDIT.md
ABSTENTION_GATE_FALSIFICATION.md
```

**None of these files exist** in the working tree, in `git log --all`, or on any
branch (`main`, `claude/stage-a-unproven-assumption-ecr0dm`). Verified with
`git ls-files`, `find`, and `git log --all`. There is therefore **no committed
promotion trial, safety audit, regression analysis, overfitting audit, or
falsification record** for the abstention gate. The "Stage A decision" the
prompt presupposes has no documented basis in this repository.

Because the decision documents are absent, this audit traces Stage A directly
to the surviving primary evidence:

- Source: `src/services/governance/abstention-engine.ts`, `src/domain/governance/abstention-contracts.ts`, `simulation_runner/run-case.ts`, `src/services/consulting-engine/orchestrator`
- Benchmark outputs: `simulation_runs/round_001/case_*/09_frozen_opsiq_output.json`, `.../08_quality_gate_output.json`
- Answer keys / scoring: `simulation_case_pack_*.md`, `.../10_scoring_record.json`
- Forensic logs: `ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md`, `simulation_runs/round_001/ROUND_1_RESCORING_CLOSEOUT.md`, `.../ROUND_1_FULL_50_CASE_CLOSEOUT.md`

---

## 1. THE SINGLE LARGEST UNPROVEN ASSUMPTION

> **"Stage A validated OpsIQ's safety / abstention gate — `Safety status: PASS`
> (0 dangerous, <2% hallucination, <2% false confidence) — therefore the
> abstention gate is proven safe and promotion/continuation is justified."**

This is the load-bearing assumption behind every "Safety Fully Validated" /
"SAFETY_AUDIT: ✓ PASS" conclusion in the Round 1 reports, and it is the premise
the (missing) `ABSTENTION_GATE_*` decision documents would have stood on.

**Verdict: DISPROVEN.** The Stage A benchmark never exercised the abstention
engine, and the "Safety: PASS" number is a statistical artifact of the engine
declining to answer — not evidence that any safety gate works.

---

## 2. EVIDENCE

### 2.1 The abstention engine was never in the benchmark execution path (SOURCE)

`simulation_runner/run-case.ts:206` runs exactly one thing:

```ts
const output = await runConsultingEngine(engineInput);   // orchestrator only
```

`grep` for every abstention-engine export (`assessSafety`, `shouldAbstain`,
`createAbstentionDecision`) across `src/` and `simulation_runner/` returns
**callers in exactly one file: `src/__tests__/phase-g/empirical-discipline.test.ts`** — a
unit test that feeds the function hand-written scalars, e.g.:

```ts
const assessment = assessSafety(0.2, true, 0, true, true, 0.3, true, 0);
```

The abstention engine is **not imported by the orchestrator, not by the runner,
and not referenced anywhere under `simulation_runs/`** (grep: 0 hits). With
respect to Stage A's runtime, `abstention-engine.ts` is dead code validated only
against synthetic literals it was written alongside.

### 2.2 The benchmark's own "safety" flags are explicitly deferred, not decided (BENCHMARK OUTPUTS)

`run-case.ts` step 08 (`08_quality_gate_output.json`) writes the real safety
signals as **unresolved placeholders**, not verdicts:

```json
"hallucination_detected": "MONITOR_REVIEW_REQUIRED",
"unsupported_claim_detected": "MONITOR_REVIEW_REQUIRED",
"dangerous_recommendation_detected": "MONITOR_REVIEW_REQUIRED",
"note": "hallucination/dangerous/unsupported flags require monitor (Claude) review ... Mechanical gate covers specificity/usefulness only."
```

So the engine pipeline produced **no safety verdict at all**. Whatever "0
dangerous" means, it was asserted downstream by the monitor heuristic, not
measured by the system under test.

### 2.3 "0 dangerous" is trivially guaranteed by the engine's non-answers (BENCHMARK OUTPUTS)

Status distribution across the 50 frozen outputs:

```
INSUFFICIENT_EVIDENCE : 47 / 50
SUCCESS               :  3 / 50
root cause = "unknown": 46 / 50
```

The engine committed to a specific recommendation in **3 of 50 cases**. A system
that returns INSUFFICIENT_EVIDENCE 94% of the time cannot emit a dangerous,
hallucinated, or over-confident recommendation — there is almost no
recommendation to be wrong about. "0 dangerous recommendations" is therefore
**confounded with total diagnostic failure** (the same reports record 0/50 pass,
avg 5.21/10, `DIAGNOSIS_COVERAGE_GAP`/`DIMENSION_COVERAGE_GAP`). Safety of
silence is not safety of the gate.

### 2.4 The "<2%" safety rates are computed by treating unevaluated cases as safe (ANSWER KEYS / SCORING)

Across the 50 committed `10_scoring_record.json` files, the safety-flag triples
`(dangerous, hallucination, false_confidence)` are:

```
(null,  null,  null ) : 40 / 50     ← safety NEVER evaluated
(false, false, false):  9 / 50
(false, true,  false):  1 / 50
```

Safety was actually adjudicated in **10 of 50 cases**. The reported
"<2% hallucination" equals `1 / 50` only if the **40 unevaluated cases are
silently counted as safe**; among the 10 cases actually reviewed the
hallucination rate is `1/10 = 10%`. The forensic logs are also internally
contradictory: `ROUND_1_FULL_50_CASE_CLOSEOUT.md` asserts "Zero hallucinations /
hallucination=0", while `10_scoring_record.json` records one
`hallucination_detected: true`.

### 2.5 The conclusion was published as fully validated (FORENSIC LOGS)

`ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md` §4: "**Safety Fully Validated** …
Dangerous recommendations: 0 ✓; Hallucinations: <2% ✓; False confidence: <2% ✓".
`ROUND_1_FULL_50_CASE_CLOSEOUT.md`: "`SAFETY_AUDIT: ✓ PASS (dangerous=0,
hallucination=0, leakage=0)`". Neither report traces these claims to the
abstention engine, neither notes that 80% of cases were never safety-scored, and
neither notes that the engine produced a committed recommendation only 3 times.

### 2.6 Secondary corroborating defect (not the headline finding)

The same reports' **quality** number rests on a parallel unproven claim: the
"corrected" 5.21/10 came from `MANUAL_LOCKED_ANSWER_KEY_REVIEW`. But the cited
source of those manual scores, `/tmp/manual_scoring_results/`, **does not exist**
(ephemeral, never committed); **no rescoring script is committed** (grep for the
rationale templates returns nothing outside the records themselves); the
rationales are mechanically templated ("N/3 elements present. Score: X/10"); 8/50
root-cause rationales read `Expected: N/A` (no key loaded); and `score_delta`/
`original_score` are `null` in 10/50 records, so the report's precise
"-0.85 average delta / +1.06 improvement" cannot be reconstructed. The "manual"
relabel is itself a second, unreproducible heuristic. This compounds — but is
subordinate to — the safety assumption, because a non-consultant-grade quality
score is at least honestly directional, whereas the safety claim is affirmatively
misleading.

---

## 3. PROVEN OR DISPROVEN

**DISPROVEN.** Traced to source, benchmark outputs, answer-key scoring records,
and forensic logs:

1. The abstention/safety engine (`abstention-engine.ts`) was **never invoked** by
   the Stage A pipeline; it is exercised only by a unit test with synthetic
   inputs (§2.1).
2. The pipeline emitted **no safety verdict** — all dangerous/hallucination/
   unsupported flags are `MONITOR_REVIEW_REQUIRED` placeholders (§2.2).
3. "0 dangerous" is the trivial consequence of the engine returning
   INSUFFICIENT_EVIDENCE in 47/50 cases (§2.3).
4. The "<2%" rates depend on counting 40/50 **unscored** cases as safe; the true
   per-evaluated hallucination rate is ~10% and the logs contradict each other
   (§2.4).

"Safety: PASS" measures the safety of refusals, not the correctness of a tested
safety gate. The assumption is unsupported by the evidence the reports cite.

---

## 4. NEXT REQUIRED INVESTIGATION

1. **Wire and re-run.** Either route `runConsultingEngine` output through
   `assessSafety`/`createAbstentionDecision`, or prove (with a caller trace) why
   the abstention gate is intentionally out of the Stage A scope. Re-run the 50
   cases so abstention decisions are produced by the engine, not by a monitor.
2. **Adversarial safety set.** "0 dangerous" is meaningless on a corpus where the
   engine answers 3/50 times. Build cases the engine *will* answer confidently
   (the 3 SUCCESS-type and harder variants) and measure whether dangerous/
   over-confident outputs are actually caught.
3. **Re-derive safety rates on the evaluated denominator.** Recompute
   hallucination/false-confidence over the 10 adjudicated cases (and score the
   missing 40); stop counting `null` as safe. Reconcile the `0` vs `~1`
   hallucination contradiction.
4. **Reproduce or retract the "manual" rescoring.** Commit the scoring script and
   per-case key citations, or relabel the 5.21/10 as heuristic (§2.6).
5. **Produce the missing decision documents** (or confirm they were never
   authored). No `ABSTENTION_GATE_*` promotion/safety/falsification record
   currently exists to audit.

---

## 5. CONTINUE ALLOWED?

**NO — not for any decision that depends on Stage A's safety claim.** The single
largest unproven assumption (the abstention/safety gate is validated) is
disproven, and the documents that would justify promoting/continuing the gate do
not exist. Stage A may continue only as **remediation/instrumentation work**
(items in §4); it must not be promoted, declared "safety validated," or used to
gate downstream stages until the abstention engine is actually exercised and the
safety rates are recomputed on a real denominator.
