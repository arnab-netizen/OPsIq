# ENGINE CAPABILITY — REMEDIATION PLAN

**Purpose:** sequenced plan to raise the engine's committed-output rate **without**
raising unsafe proceeds. **Date:** 2026-06-17 ·
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Mode:** planning only — no implementation, no safety-gate/scoring/answer-key
change. **Not a Stage A pass claim.** Grounded in `ENGINE_CAPABILITY_FAILURE_ANALYSIS.md`.

---

## GUARDRAILS (apply to every slice below)
1. **Safety gate is frozen.** No change to `abstention-engine.ts`,
   `consulting-safety-adapter.ts`, `causal-challenge.ts`, `constraint-alignment.ts`.
2. **Non-regression of safety.** After each slice, the adversarial suite must
   stay **10/10 caught, 2/2 controls preserved**; no Round 1 case may move from
   abstain into an *unsafe* proceed. New committed outputs must pass B+A+C.
3. **Reproducibility.** Any scoring uses the B4 replacement standard (committed
   generator + inputs, deterministic, honest method label, denominator transparency).
4. **No answer-key leakage** into the engine path.

---

## SLICE SEQUENCE

### E0 — Honest abstention relabel (zero-risk, recommended pairing)
- **Change:** distinguish `INSUFFICIENT_EVIDENCE` (data truly absent) from
  `INSUFFICIENT_MODEL_COVERAGE` (engine has no archetype for the present evidence)
  at the diagnosis stage. Reporting-only; no behavior change.
- **Why:** ~44/50 "INSUFFICIENT_EVIDENCE" are mislabeled model-coverage gaps.
- **Validation:** re-run benchmark; counts reclassify; gate behavior identical.

### E1 — financial_health diagnosis archetype(s)  ← **RECOMMENDED FIRST CAPABILITY SLICE**
- **Change:** add archetype(s) for the dimension present in 100% of cases:
  margin erosion / negative unit economics / liquidity-runway risk. Pattern keyed
  on financial_health evidence + numeric polarity (not just substrings).
- **Why:** highest leverage — addresses the dominant bottleneck (~44 cases blocked
  for lack of a financial model).
- **Validation:** committed-output rate rises on financial cases; adversarial
  suite still 10/10; HSW-05 (negative-margin) must still ABSTAIN (dangerous);
  reproducible re-score of newly-committed cases.

### E2 — De-brittle the trigger layer
- **Change:** replace exact-substring triggers with synonym/lexicon or
  evidence-feature scoring; keep isCritical as a signal, not a hard gate.
- **Why:** recovers RW-003/RW-004-type in-domain cases the keywords miss.
- **Validation:** RW-003/RW-004 become committed *and* pass the gate, or abstain
  for a correct reason; no increase in confident-wrong (gate suite 10/10).

### E3 — market_position / strategic archetype
- **Change:** add competitive-displacement / demand-shift / regulatory archetypes
  (the out-of-model causes that Option A currently routes to abstention).
- **Why:** converts several "correctly abstained" strategic cases into correctly
  *diagnosed* ones, reducing reliance on abstention as the only safe answer.
- **Validation:** HSW-01/04/07/09-type causes diagnosed correctly; the causal
  challenge no longer needs to fire on them; controls preserved.

### E4 — Intervention specificity
- **Change:** map each archetype to a case-tailored first action using the actual
  evidence (numbers, constraints), replacing generic templates.
- **Why:** drives root-cause-match / first-action quality → the path to any future
  consultant-grade pass; addresses the 0/50 pass + RW-001/RW-005 misalignment.
- **Validation:** standard-compliant quality re-score shows improved
  root-cause-match/first-action on committed cases; gate suite unchanged.

### E5 — Standard-compliant quality benchmark
- **Change:** build a committed, reproducible 13-dimension quality scorer (per B4
  standard) to replace the retracted manual rescore.
- **Why:** restores a *verified* quality metric so promotion can ever be assessed.
- **Validation:** deterministic re-run reproduces scores; denominators transparent.

---

## DEPENDENCY ORDER
E0 → E1 → E2 → (E3 ∥ E4) → E5. E0 is a truth-in-labeling prerequisite; E1 is the
highest-ROI capability slice; E5 gates any future quality verdict.

## ESTIMATES (from failure analysis)
- **Answerable now (existing 3 archetypes, de-brittled):** ≈ **5** (3 SUCCESS +
  RW-003 + RW-004).
- **Answerable after E1+E3:** majority (≈ **40+**), since financial/market cover
  the dominant dimensions.
- **Truly need more input:** ≈ **0–5** (most cases carry rich committed evidence).

## EXIT CRITERION FOR THE WORKSTREAM
Stage A may be *re-trialed* (not auto-promoted) only when: committed-output rate
is materially higher, a standard-compliant quality metric exists and is
acceptable, the adversarial suite remains 10/10 with controls preserved, RW-005 is
adjudicated, and RC-7 residue is addressed or bounded. Until then **Stage A
remains BLOCKED**.

## NOT IN SCOPE / STILL OPEN
- RW-005 human adjudication (owner action).
- RC-7 semantic residue (model-based verifier; separately authorized).
- Safety-gate changes (frozen by guardrail #1).
