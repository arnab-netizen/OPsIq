# ROUND 2 — REMEDIATION IMPLEMENTATION ORDER

**Mode:** planning only. No code/engine/scorer/gate/threshold/key/validator/corpus/
source change. No improvement, promotion-readiness, or consultant-grade claim.
**Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`.

Ranked from `ROOT_CAUSE_FAILURE_MAP.md` + `REMEDIATION_DEPENDENCY_GRAPH.md`. Every
"estimated cases improved / lift" is a CEILING (reachable membership), not a claim;
realized movement is measured only by re-running R0 after the slice.

---

## 1. RANKED SEQUENCE

### #1 — R1 Lexical-trigger hardening (cheap guard, parallelizable)
- **Failures addressed:** I (financial decoys) — 8 cases ceiling.
- **Estimated cases improved:** up to 8 (ADV-02, FRC-01/04/05/07/09/10/13 decoy
  suppression); 0 promised — some will then correctly abstain, not diagnose.
- **Estimated benchmark lift:** diagnosis axis +0–8 of 103; no first-action lift.
- **Regression risk:** LOW. **Required reruns:** R0 full corpus. **Adversarial
  reruns:** YES (the 10/10 adversarial suite + 2/2 controls + Round-1 baseline).
- **Benchmark expansion before/after:** neither — independent guard. Do first or
  alongside R2 because it stabilizes authoring, but it is NOT a capability.

### #2 — R2 Causal adjudication layer (KEYSTONE — highest ROI)
- **Failures addressed:** L (27), B (15), G (3), C/E (1), and RELIEVES 14 of the
  H gate-holds (the engine resolves the conflict instead of fail-closing).
- **Estimated cases improved:** up to 41 (15 wrong-primary corrected + 14 gate-holds
  released to a correct proceed + up to 12 decoys re-attributed/abstained). Ceiling.
- **Estimated benchmark lift:** diagnosis (toward correct primary on FRC), safety
  (release of the 14 causal-challenge holds), abstention calibration.
- **Regression risk:** MED. **Overfit risk:** MED-HIGH → hold out a random FRC
  subset; require generalization + zero regression on the 6 covered controls.
- **Required reruns:** R0 full corpus. **Adversarial reruns:** YES — mandatory; the
  adjudicator must not convert any abstain into an unsafe proceed.
- **Benchmark expansion before/after:** AFTER R2. Authoring more cases before R2 is
  low-information (the dominant failures are already proven).

### #3 — R4 Action-sequencing engine (largest action-axis bucket)
- **Failures addressed:** D (27), K (24), F (4) — templates → planner.
- **Estimated cases improved:** up to 51 first-action fails (27 + 24 with overlap),
  including the 6 UNSAFE_ACTION and DC-01 sequencing miss.
- **Estimated benchmark lift:** first-action axis (currently 34.9%) is the
  load-bearing axis; this is where most movement is available.
- **Regression risk:** MED (must not produce an unsafe step). **Overfit risk:**
  LOW-MED. **Required reruns:** R0. **Adversarial reruns:** YES (DC/ADV cases).
- **Benchmark expansion before/after:** AFTER (needs R2's correct diagnosis first).
- **Depends on:** R2.

### #4 — R3 Prioritization engine (survival/urgency precedence)
- **Failures addressed:** C/E (PC-01 measured) + the PC set once R2 lands.
- **Estimated cases improved:** 1 measured + up to 7 PC cases post-R2.
- **Regression risk:** MED. **Required reruns:** R0. **Adversarial:** YES.
- **Depends on:** R2 (correct primary), benefits R4.

### #5 — R5 Multi-domain synthesis
- **Failures addressed:** G (3) + multi-cause relational depth.
- **Estimated cases improved:** 3 + MC depth. **Depends on:** R2.
- **Required reruns:** R0. **Adversarial:** YES.

### #6 — R6/R7/R8 Archetype expansion (business-model / strategic / financial)
- **Failures addressed:** A (up to 38) + the M/N/O lenses.
- **Estimated cases improved:** up to 38, **but ONLY after R2** — otherwise each
  archetype adds a confident decoy and REGRESSES B/L.
- **Regression risk:** MED-HIGH if early; MED if post-R2, one at a time.
- **Required reruns:** R0 + adversarial **per archetype**.
- **Benchmark expansion before/after:** the remaining 47 authored cases are most
  valuable AFTER R2 and as these archetypes land (higher-signal cases against a
  smarter engine).

### #7 — R9 Execution reasoning
- **Failures addressed:** P (execution under owner constraints). **Depends on:** R4.

---

## 2. CRITICAL AUDIT — REJECTED RECOMMENDATIONS

The following are explicitly REJECTED for this program (with the reason):
- **Add archetypes (R6–R8) before R2** — REJECTED. The 12 false_root_cause + 8
  financial-decoy cases prove new archetypes become new decoys without adjudication.
- **Change any threshold before the root cause is proven fixed** — REJECTED. The
  over-abstention is not a threshold problem; lowering the confidence/evidence-
  support cutoffs would mask missing reasoning and admit unsafe proceeds.
- **Weaken the safety gate / loosen causal-challenge** — REJECTED. The 14 H holds are
  the gate correctly fail-closing on unresolved conflicts; the fix is R2, not a gate edit.
- **"Reduce abstention" by lowering standards** — REJECTED. Abstention recall is the
  one near-passing axis (95.7%) and the single dangerous_proceed (DC-01) shows the
  gate is, if anything, not strict enough on tempting actions. Reduce abstention only
  by adding reasoning that lets the engine proceed *safely*.
- **Use answer keys / benchmark labels / case ids at runtime** — REJECTED. R0 reads
  keys only post-freeze; every fix must keep that boundary.
- **Overfit to specific case ids** — REJECTED. R2/R3/R4 rules must be general and are
  validated against held-out splits.

---

## 3. FINAL SECTION — DIRECT ANSWERS

**1. Single biggest blocker to behaving like a real consultant?**
No causal reasoning. The engine is a lexical surface-classifier
(`diagnosis-engine.ts:364–405` picks `matchedPatterns[0]` by confidence). It cannot
attribute a surface symptom to its driver, so on 15 cases it commits a confidently
wrong primary and on 14 more the safety gate must fail-closed because the engine
cannot resolve the conflict.

**2. Highest-ROI fix?**
R2 causal adjudication. It is the keystone: up to 41 cases reachable, it both
corrects wrong primaries (unsafe failures) and releases 14 gate-holds, and it is the
hard prerequisite for R3/R4/R5/R6–R8. (R0 is its measurement prerequisite and is
already complete; R1 is a cheap parallel guard.)

**3. What fix must happen before any more benchmark authoring?**
R2 (with R1 as a cheap guard). Authoring more cases against an engine with no causal
reasoning is low-information and keeps tripping the financial-decoy defect.

**4. Is completing the remaining 47 cases valuable before remediation?**
NO. The dominant failures (false_root_cause 12, over_abstention 44,
correct_diagnosis_wrong_action 27) are already proven decisively at n=103. More cases
add cost, not signal, until R2 changes engine behavior. Author the remaining 47
AFTER R2 for higher-signal coverage.

**5. What happens if R2 causal adjudication is skipped?**
Every downstream fix degrades: R3 prioritizes off a wrong primary, R4 sequences the
wrong diagnosis, and R6–R8 archetypes each add a new confident decoy — the
false_root_cause count would rise, not fall. The 14 causal-challenge holds remain,
so over-abstention stays high. Stage A cannot move toward promotion.

**6. What happens if more archetypes are added first?**
The 9 new archetypes become 9 new loud surface matchers competing in the same
unadjudicated `matchedPatterns.sort()`; uncovered-cause cases that today abstain
honestly would instead draw confident wrong primaries. B/L/I regress; the safe
failures (bucket A, currently honest abstentions) become unsafe failures.

**7. Minimum remediation set before Stage A can realistically move toward promotion?**
**R1 + R2 + R4**, each re-scored by R0 and re-run against the frozen adversarial
suite, with the safety gate unchanged:
- R1 removes the financial-decoy lexical defect (I).
- R2 gives causal adjudication (fixes B/L, relieves H, enables everything).
- R4 turns fixed templates into a stabilize-before-optimize planner (fixes D/K, the
  load-bearing first-action axis, and the DC-01 dangerous proceed).
R3/R5 and the archetype family (R6–R8) follow for breadth, but R1+R2+R4 is the
minimum that converts confident-wrong and no-action failures into safe, correct
first moves. Promotion still requires the full re-trial to clear the pre-registered
bar and the adversarial suite to hold — neither is claimed here.

---

## 4. SUMMARY

- **Cases reviewed:** 70 failing of 103 (33 clean).
- **Largest bucket:** A Missing archetype — 38 cases (36.9%).
- **Deepest root cause / highest ROI:** R2 causal adjudication (L/B cluster).
- **Order:** R0 (done) → R1 ‖ R2 → R4 → R3 → R5 → R6/R7/R8 → R9.
- **Fix before more authoring:** YES (R2).
- **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
