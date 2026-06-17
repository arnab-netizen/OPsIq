# RC-7 RUNTIME VERIFIER — AUTHORIZATION

**Mode:** ROOT-CAUSE DESIGN — documentation only. **No implementation this run.**
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`

---

## RECOMMENDED FIX (exactly one smallest slice)

> **Option A — Independent causal-challenge verifier (deterministic, rule-based v1):
> diagnosis↔stated-problem alignment + adverse off-archetype evidence detection.**

This is the smallest slice that installs an actual *verification* step against the
root cause (RC-7: confident diagnoses proceed without any correctness check), is
production-valid (runtime signals only), and attacks the dominant failure mode
(6–8 of the 10 probes are wrong/misaligned diagnoses). Options C and D are
explicitly **deferred** as the next two narrow slices toward composite E. Option B
is **rejected** (pure structure flags the controls — proven in the design doc).

### Exact behavior required (when authorized)
A committed diagnosis is routed through a causal challenge **before proceed**. It
abstains/escalates (existing `OUTSIDE_VALID_SCOPE` or `CONFLICTING_SIGNALS` state)
when **either**:
1. **Misalignment:** the diagnosis topic has no meaningful overlap with the
   `businessProblem` (keyword/topic test), i.e. the engine answered a different
   question than was asked; **or**
2. **Adverse off-archetype evidence:** there is evidence in a dimension the chosen
   archetype ignored whose finding is **adverse** (negative numeric sign in
   `supportingData`, or negative-lexicon match: down/negative/loss/fraud/ban/
   shrinkage/refund/regulation), indicating a stronger out-of-model cause.

Benign off-archetype evidence (e.g. "healthy margins", "stable") must **not** fire
(preserves controls). A committed, aligned diagnosis with no adverse off-dimension
evidence proceeds unchanged.

### Exact files to change
1. `src/services/governance/causal-challenge.ts` *(new)* — pure functions:
   `assessProblemAlignment(businessProblem, diagnosis)` and
   `detectAdverseOffArchetypeEvidence(diagnosis, evidence)`. No I/O, deterministic.
2. `src/services/governance/consulting-safety-adapter.ts` — derive the causal-
   challenge signal from data it already receives + the engine input evidence, and
   pass it to the gate.
3. `src/services/governance/abstention-engine.ts` — one new optional rule
   consuming the causal-challenge signal (reuse existing `AbstentionState`; no new
   confidence thresholds beyond the new rule's own match criteria).

> No production engine/diagnosis/scoring change; no answer-key or probe-key use;
> no change to existing confidence cutoffs or the Option-B support threshold.

### Runtime signals used
`businessProblem`, `evidence[].dimension/finding/supportingData/isCritical`,
`rootCauseDiagnosis.type/evidenceIds`, `alternativeExplanations`. Nothing else.

### Tests required
1. Unit (causal-challenge): alignment positive/negative; adverse vs benign off-
   dimension polarity (incl. "healthy margins" → benign, "margin negative −12%" →
   adverse).
2. Unit (engine): new rule abstains on misalignment / adverse off-evidence;
   inert when absent; existing 8-arg + Option-B behavior unchanged (regression).
3. Wiring (adapter): extend `consulting-safety-adapter.test.ts`.

### Benchmark / probe validation required
- Re-run `adversarial-probe-run.ts` (gate now with causal challenge): **target —
  the misalignment/adverse subset (≥6 of 10) flips PROCEED→ABSTAIN; controls
  HSW-C1/HSW-C2 remain PROCEED.** Record residual proceeds (expected: HSW-03 and
  possibly HSW-09 remain — they need C/D, the next slices).
- Re-run `apply-abstention.ts --outfile <new>` over Round 1: 47 INSUFFICIENT
  remain abstain; RW-001/RW-005 remain abstain (Option B); record RW-002 outcome
  (may flip — its business_relevance was 3.0; flagging it is acceptable, not a
  regression). **No old outputs overwritten.**
- This step is NOT complete unless controls are preserved and ≥6 probes flip.

### Acceptance / exit criterion
Slice passes only if: ≥6 adversarial probes flip to abstain, **both controls stay
proceed**, the 47-case baseline is unchanged, all unit/regression tests pass, and
non-DB gates are green. Residual uncaught probes (HSW-03 constraint, HSW-09
danger) are documented as the C and D follow-on slices — **Stage A stays BLOCKED**
until composite E lands and the full probe set is covered with controls preserved.

### Rollback plan
Additive (one new pure module + one optional adapter field + one optional engine
rule). Rollback = revert the three files and re-run the harnesses to regenerate
decisions. The rule is inert when the causal-challenge signal is not supplied, so
it can be disabled without code removal.

---

## AUTHORIZATION STATUS

**Implementation authorized: NO.** Documentation only per ROOT-CAUSE DESIGN MODE.
Option A (rule-based causal challenge) is recommended and specified; C and D are
the queued follow-ons; E is the eventual complete fix. A subsequent run with an
explicit implementation instruction is required before any code changes.

**Honest limitation:** even Option A's polarity/alignment rules are heuristic —
the irreducible semantic core of RC-7. A fully robust verifier may ultimately
require an independent model-based reasoner; that is a larger, separately-
authorized decision, not this slice.

**Stage A remains BLOCKED for promotion.**
