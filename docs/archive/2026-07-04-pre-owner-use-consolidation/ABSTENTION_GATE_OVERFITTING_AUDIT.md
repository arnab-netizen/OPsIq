# ABSTENTION GATE — OVERFITTING AUDIT

**Purpose:** assess whether the gate's rules are overfit to the specific
adversarial probes / Round 1 cases rather than generalizing.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Replaces:** absent `ABSTENTION_GATE_OVERFITTING_AUDIT.md` (B5). No code/scoring/
threshold/answer-key/benchmark-output change. **Not a Stage A pass claim.**

## Evidence reviewed (committed)
`src/services/governance/{abstention-engine,consulting-safety-adapter,causal-challenge,constraint-alignment}.ts`;
probe outputs `adversarial_safety_probes_v2{,_option_a,_option_c}/`; Round 1 `12/14/15/16_*`.

## Overfitting risks examined
1. **Thresholds.** Only one numeric threshold was added for quality
   (`LOW_EVIDENCE_SUPPORT_THRESHOLD = 0.5`, `EVIDENCE_SUPPORT_GATE_VALIDATION_REPORT.md`).
   It is a principled "majority of available evidence" cutoff, not tuned per case;
   it separates RW-001 (0.167)/RW-005 (0.200) from RW-002 (0.750) and the controls
   (0.75) without case-specific constants. **Low overfit risk.**
2. **Lexicons (Option A/C).** `causal-challenge.ts` and `constraint-alignment.ts`
   use **category-based** stems (market/financial/legal/people/macro/integrity;
   compliance terms), not probe-specific phrasings. **Risk: MEDIUM** — lexical
   coverage is finite; novel wording can evade (documented limitation,
   `RC7_OPTION_C_VALIDATION_REPORT.md` §6). This is *under-fitting* (false
   negatives), not classic overfitting (it does not memorize probe IDs).
3. **No benchmark labels / case IDs / probe keys** are referenced by production
   code — verified: the gate reads only `businessProblem`, evidence fields,
   diagnosis fields, owner profile. **No leakage-based overfit.**
4. **Controls discriminate.** The 2 correct controls (structurally identical to
   unsafe probes) still PROCEED, showing the rules key on semantic polarity/
   feasibility, not on surface structure. **Evidence against overfitting.**

## Proven facts
- Rules generalize across 3 archetypes and 6+ distinct cause categories without
  per-case constants.
- The only quality threshold is justified independently of the test cases.

## Open blockers / residual risk
- Lexical detectors are an **approximation**; generalization to unseen wordings is
  unproven. A model-based verifier would reduce this (deferred, separately
  authorized).
- The committed-output test surface is small (3/50 Round 1), limiting the
  evidence that proceed-path discrimination generalizes.

**Stage A remains BLOCKED.** Overfitting to specific probes is not the primary
risk; *under-coverage* of unseen causal wordings is the live risk.
