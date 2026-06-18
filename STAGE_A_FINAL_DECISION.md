# STAGE A — FINAL DECISION

**Date:** 2026-06-18 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Mode:** decision document only; no code/scoring/threshold/key/corpus change. Grounded in
`STAGE_A_FINAL_READINESS_AUDIT.md` (machine-reconciled against the
`round_002_retrial_pc01_survival_dominance` artifact). Supersedes the earlier
`STAGE_A_FINAL_HOSTILE_DECISION.md` (DO_NOT_PROMOTE), which predated the safety
remediation that has since driven unsafe/dangerous proceeds to zero.

## FINAL DECISION: **PROMOTE_TO_INTERNAL_OWNER_MODE_TRIAL_ONLY**

(Status option 2 — the lowest non-blocked rung. This is **NOT** a Stage A pass, **NOT** a
validation, and **NOT** a launch.)

## EXACT REASON

The safety half of the pre-registered bar is now fully and machine-verifiably satisfied
on the entire available corpus:
- **unsafe_proceed = 0, dangerous_proceed = 0** (the DC-01 leak was closed by the
  owner-action danger detector; every adversarial case ADV-01/02/03/04/05 and DC-01..05
  is held ABSTAIN);
- **abstention recall = 100%** (23/23 expected-ABSTAIN-gate cases abstain);
- **false_root_cause = 0**, wrong_priority = 0;
- the 6 residual over-abstentions are all SAFE conservative holds (escalate-to-human),
  not unsafe proceeds;
- the engine now also *commits* (COMMIT_COVERED 90/103) with diagnosis 93.20% and
  first-action 87.38% — it is no longer "safe only because it never commits."

That safety posture is sufficient for a **human-supervised, advisory-only internal
trial**, where the owner reviews every committed recommendation and the gate is free to
abstain. It is NOT sufficient for any higher status because the validation/coverage gates
are unmet: corpus is **103/150**, **0 cases are real-source-backed**, all metrics are
**in-sample** on a self-authored synthetic benchmark, and **quality is unverified**
against a reproducible standard.

## SCOPE OF ALLOWED USAGE

- Internal OpsIQ owner-mode **simulation/trial** on the owner's own real business data.
- Outputs are **advisory only**; a human owner must review and approve before any action.
- The safety gate must remain active and free to abstain (escalate-to-human) at all times.
- Purpose of the trial: gather the real-world signal needed for the unmet validation
  gates — not to assert that Stage A is validated.

## EXPLICIT NON-USAGE RESTRICTIONS

- **No public / self-serve users.**
- **No paid users.**
- **No autonomous action** on any committed recommendation (human-in-the-loop mandatory).
- **No "validated / consultant-grade / Stage A pass / production-ready" claim** in any
  artifact, UI, or marketing.
- **No loosening** of any safety gate, diagnosis trigger, threshold, scorer, or answer
  key to raise commit rate or scores.

## EXPLICIT ANSWERS

- **May Stage A be used for internal owner-mode simulation?** **YES** — supervised,
  advisory-only, human-in-the-loop, on the owner's own data.
- **May Stage A be used for public users?** **NO.**
- **May Stage A be used for paid users?** **NO.**
- **Are more benchmark cases required (before higher status)?** **YES** — complete the
  150-case pack (47 unbuilt), including the planned real/blind sets.
- **Is source verification required before public use?** **YES, mandatory** — 0 cases are
  currently real-source-backed; public/paid use is forbidden until the
  `ROUND_2_REAL_WORLD_SOURCE_STANDARD` set is realized and verified.
- **May Stage B start?** **YES, conditionally** — Stage B groundwork that does NOT depend
  on a Stage A public launch may begin in parallel; it must not assume Stage A is
  validated, and it must not be a vehicle to bypass the unmet Stage A gates.

## CONDITIONS TO LEAVE THE TRIAL TIER (toward LIMITED_ALPHA / PUBLIC)

1. Complete the corpus to 150 cases (real + blind sets built).
2. Realize and verify real-source backing per the source standard (G9).
3. Produce a standard-compliant, reproducible consultant-grade quality score (G7/G11).
4. Demonstrate the safety posture (0 unsafe / 0 dangerous / 100% abstention recall) holds
   on the real/blind/held-out cases, not just in-sample.
5. Address the RC-7 semantic-residue risk with a non-lexical verifier (separately
   authorized).

Until 1–5 are explicitly satisfied, Stage A remains capped at
INTERNAL_OWNER_MODE_TRIAL_ONLY.

## STAGE A STATUS LINE

**PROMOTE_TO_INTERNAL_OWNER_MODE_TRIAL_ONLY** — safety gates PASS; validation/coverage
gates (corpus completeness, source verification, held-out/quality) NOT satisfied. This is
not a pass; the public-ready bar remains BLOCKED.
