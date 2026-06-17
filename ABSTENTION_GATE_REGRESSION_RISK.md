# ABSTENTION GATE — REGRESSION RISK

**Purpose:** assess the risk that the safety-gate changes regress prior behavior.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Replaces:** absent `ABSTENTION_GATE_REGRESSION_RISK.md` (B5). No code/scoring/
threshold/answer-key/benchmark-output change in this slice. **Not a Stage A pass claim.**

## Proven facts (committed evidence)
1. **Additive, opt-in design.** Every gate addition (evidence-support, causal
   challenge, constraint alignment) is an **optional** parameter on `assessSafety`;
   the rules are inert when their signal is not supplied. Existing 8-arg callers
   are unaffected — proven by the passing `empirical-discipline.test.ts` (48 tests).
2. **Abstain-only.** Each new rule can only ADD an abstention; none converts an
   abstain into a proceed (`abstention-engine.ts`). So the 47 INSUFFICIENT_EVIDENCE
   baseline abstentions are preserved across `12_*`→`16_*` (verified each slice).
3. **Test suite grew without breakage.** 62 → 69 → 79 tests passing across the
   B/A/C slices (`EVIDENCE_SUPPORT_*`, `RC7_OPTION_A_*`, `RC7_OPTION_C_*` reports).
4. **Old outputs preserved.** `12_*` (v1), `14_*` (Option B), `15_*` (Option A),
   `16_*` (Option C) are separate files; no benchmark output overwritten.

## Regression risk areas
- **Over-abstention (false positives).** The gate now favors abstaining on
  committed cases citing out-of-model causes or tight constraints. This trades
  automation for safety (the safe direction) and could abstain on legitimate cases
  in production. **Risk: MEDIUM**, mitigated by abstain⇒escalate-to-human.
- **Pre-existing unrelated type error** `simulation_runner/run-case.ts:149`
  predates this work (present on HEAD before the slices); not introduced/worsened.
- **Static gate.** No DB; `npx prisma validate` passes; `npx tsc --noEmit` clean on
  all changed governance files.

## Open blockers
- No production-traffic regression data exists (benchmark-only); real-world false-
  positive rate is unmeasured.

**Stage A remains BLOCKED.** Regression risk to existing behavior is **LOW**;
the live risk is forward over-abstention, not backward breakage.
