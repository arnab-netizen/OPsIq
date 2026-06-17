# STAGE A — FINAL HOSTILE DECISION

**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Replaces:** the absent `STAGE_A_FINAL_HOSTILE_DECISION.md` (B5). Cites committed
evidence only; does not rely on the retracted 5.21/10 manual rescoring; no
production code/scoring/thresholds/answer keys/benchmark outputs changed here.

---

## DECISION: **DO_NOT_PROMOTE**

Stage A (the OpsIQ consulting engine + its safety/abstention gate) **must not be
promoted**. The safety gate is materially improved and currently blocks all
designed unsafe outputs, but Stage A as a validated consultant-grade system is not
established, a hostile finding is unresolved, and the quality metric is unverified.

---

## PROVEN FACTS (committed evidence)
- Abstention gate is **wired and exercised** 50/50 (was dead code — B1). `SAFETY_WIRING_VALIDATION_REPORT.md`.
- Safety rates recomputed on a **transparent denominator**; 0-vs-1 hallucination
  reconciled to 1 (RW-001). `SAFETY_DENOMINATOR_RECOMPUTATION_REPORT.md`, `SAFETY_MONITOR_REVIEW_COVERAGE_REPORT.md`.
- Composite gate (evidence-support + causal-challenge + constraint-alignment)
  catches **10/10** designed unsafe probes and preserves **2/2** controls;
  Round 1 49/50 abstain. `RC7_OPTION_C_VALIDATION_REPORT.md`, `..._option_c/`.
- Changes are additive/abstain-only with **no baseline regression**; 79 tests pass.
  `ABSTENTION_GATE_REGRESSION_RISK.md`.
- Unreproducible "manual" rescoring **retracted**; reproducibility standard set.
  `B4_RESCORING_REPRODUCIBILITY_DECISION.md`.

## DECISIVE NEGATIVES (why not PROMOTE / PROMOTE_WITH_LIMITATIONS)
1. **Engine is not consultant-grade.** 47/50 Round 1 cases return INSUFFICIENT_EVIDENCE;
   only 3 SUCCESS; 0/50 meet the consultant-grade bar. The system is safe largely
   because it rarely commits — not because it advises well. `SAFETY_WIRING_VALIDATION_REPORT.md`.
2. **Quality UNVERIFIED.** The only quality figure (5.21/10) is retracted; no
   standard-compliant quality score exists. `B4_RESCORING_REPRODUCIBILITY_DECISION.md`.
3. **Open hostile finding.** RW-005 hallucination verdict UNRESOLVED. `SAFETY_MONITOR_REVIEW_COVERAGE_REPORT.md`.
4. **RC-7 semantic residue.** Gate detectors are lexical heuristics; a cue-free,
   benign-looking, constraint-feasible wrong recommendation can still pass.
   `RC7_OPTION_C_VALIDATION_REPORT.md` §6.

## WHY NOT INVALID_BENCHMARK
The benchmark is **not** invalid: frozen outputs, answer keys, and the case packs
are intact and deterministic; the defects were in *interpretation* (wiring,
denominator, reproducibility, decision docs), which are now corrected or retracted.
The benchmark remains usable; the *system* is what fails promotion.

## EXACT UNRESOLVED BLOCKERS
- RW-005 human hallucination adjudication.
- RC-7 semantic residue (robust factuality/causal verification; model-based
  verifier deferred, separately authorized).
- Quality UNVERIFIED (optional standard-compliant 13-dimension rescore).
- Engine capability: raise committed-output rate without raising unsafe proceeds.
- Option D (danger/irreversibility) advisory defense-in-depth.

## SCOPE OF WHAT *MAY* PROCEED
The **abstention gate** may be retained and relied upon as a safety brake (it
passes its trial criteria 1–5, 9 in `ABSTENTION_GATE_PROMOTION_TRIAL.md`). This is
not promotion of Stage A.

---

**FINAL VERDICT: DO_NOT_PROMOTE. Stage A remains BLOCKED.**
