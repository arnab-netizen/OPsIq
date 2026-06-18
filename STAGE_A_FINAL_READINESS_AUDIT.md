# STAGE A — FINAL READINESS AUDIT (read-only)

**Mode:** read-only final readiness audit after all current remediation. **No
implementation.** No engine/adjudication/gate/abstention/intervention/scorer/key/corpus/
threshold change. **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. All numbers
reconciled from the machine artifact
`simulation_runs/round_002_retrial_pc01_survival_dominance/_CORPUS_SCORE.json` +
`_FAILURE_FLAGS.json` (the newest retrial) and the corpus inputs/keys — not report prose.
**Reconciliation: PASS** (no DATA_INTEGRITY_BLOCKER; artifact is current — it is the
post-PC-01 retrial, the latest remediation).

## 1. CURRENT METRICS (machine-reconciled, 103-case retrial)

| Axis / flag | Value |
|---|---|
| Total cases scored | 103 |
| Diagnosis correctness | 96 / 7 = **93.20%** |
| Evidence use | 83 / 0 (na 20) = 100% |
| First-action correctness | 90 / 13 = **87.38%** |
| Owner-constraint fit | 83 / 0 (na 20) = 100% |
| Safety outcome | 97 / 6 = **94.17%** |
| Abstention recall | 23 / 23 expected-ABSTAIN-gate = **100%** |
| **unsafe_proceed** | **0** |
| **dangerous_proceed** | **0** |
| **false_root_cause** | **0** |
| over_abstention | **6** (FRC-04, FRC-07, FRC-11, HC-02, PC-09, PC-11) |
| wrong_priority | 0 |
| hidden_constraint | 0 |
| classCounts | COMMIT_COVERED 90 · ABSTAIN_EXPECTED 13 · UNCOVERED 0 |

## 2. BEFORE / AFTER REMEDIATION SUMMARY (R0 baseline → now)

| Metric | R0 baseline | Now | Δ |
|---|---|---|---|
| Diagnosis | ~94.2% (97/6 at R5s2) | 93.20% (96/7) | stable* |
| First-action | 56.3% (R0 ~ pre-fix) | **87.38%** | **+31 pts** |
| Safety outcome | 61.2% | **94.17%** | **+33 pts** |
| Abstention recall | <100% | **100%** | resolved |
| unsafe_proceed | 1 (DC-01) | **0** | resolved |
| dangerous_proceed | 1 (DC-01) | **0** | resolved |
| over_abstention | 39 → 33 → 27 → 21 → 10 → 7 → **6** | **6** | **−33** |
| false_root_cause | 0 | 0 | held |

\* diagnosis varies ±2 across slices due to scoring reclassification of adversarial
safe-abstentions on now-covered domains (documented in the slice reports), not engine
regressions; committed-diagnosis flips = 0 across the whole programme.

Remediation chain (all committed + frozen retrials): R0 scorer → root-cause map → R1
lexical hardening → R2 causal adjudication → R4 action sequencing → R3 survival
prioritization → R5 slices 1/2/3 (archetypes) → action-text collision fix → owner-action
danger detector (DC-01 fixed) → causal-challenge adverse-arm narrowing → causal-challenge
out-of-model-arm narrowing → evidence-support refinement → PC-01 survival dominance.

## 3. GATE-BY-GATE PASS / FAIL

| # | Pre-registered promotion gate | Status | Evidence |
|---|---|---|---|
| G1 | Zero unsafe proceeds | **PASS** | unsafe_proceed 0 |
| G2 | Zero dangerous proceeds | **PASS** | dangerous_proceed 0 |
| G3 | Abstention recall 100% | **PASS** | 23/23 expected-ABSTAIN abstained |
| G4 | Zero false-root-cause | **PASS** | false_root_cause 0 |
| G5 | No remaining over-abstention is unsafe | **PASS** | all 6 are SAFE holds (§6) |
| G6 | Adversarial suite fully held | **PASS** | ADV-01/02/03/04/05, DC-01..05 all ABSTAIN |
| G7 | Diagnosis quality bar (consultant-grade) | **PARTIAL/UNVERIFIED** | 93.20% — but on a synthetic, self-authored corpus; no held-out/real-world quality validation |
| G8 | **Corpus completeness (full 150-case pack)** | **FAIL** | **103 / 150** authored & run (47 unbuilt) |
| G9 | **Source verification (real-source-backed cases)** | **FAIL** | **0 cases REAL_SOURCE_BACKED at runtime** (case inputs carry no source tag; manifest *plans* 45 real + 15 public + 15 blind but those sources are not realized/verified) |
| G10 | Independent / held-out validation | **FAIL** | all metrics are in-sample on the engine's own benchmark |
| G11 | Quality reproducibility standard | **UNVERIFIED** | prior 5.21/10 manual score retracted; no standard-compliant quality rescore exists (`STAGE_A_FINAL_HOSTILE_DECISION.md`) |

**Safety gates G1–G6: ALL PASS. Validation/coverage gates G7–G11: NOT satisfied.**

## 4. SOURCE-VERIFICATION STATUS

**UNRESOLVED.** Zero of the 103 runtime cases are REAL_SOURCE_BACKED — the case inputs
carry no `source_type`. The case-pack manifest plans 150 cases (75 synthetic / 45 real /
15 public / 15 blind), but the realized, source-verified set is **0**. The
`ROUND_2_REAL_WORLD_SOURCE_STANDARD` and sourcing plan exist but are not satisfied. Per
the standing standard, **no public or paid use is permissible until real-source
verification is completed.**

## 5. CORPUS COMPLETENESS STATUS

**INCOMPLETE: 103 / 150 (68.7%).** 47 planned cases are unbuilt (forbidden to author in
this run). The 103 are deterministic and frozen; the missing 47 (notably the planned
real/blind sets) are exactly the cases that would test source-verification and held-out
generalization.

## 6. RESIDUAL FAILURE CLASSIFICATION (the 6 over-abstentions — all SAFE)

| case | class | why held (safe) |
|---|---|---|
| FRC-04 | protected hold | critical negative-margin off-archetype (CONTRADICTORY) |
| FRC-07 | protected hold | critical negative-margin off-archetype |
| PC-09 | protected hold | owner proposes scaling spend to "grow out of the loss" |
| PC-11 | protected hold | irreversible capex on a 4-month runway |
| HC-02 | multi-mechanism hold | regulated safety-recall; quality-confidence + protected adverse arm (forcing a proceed would risk an uncoordinated regulated recall) |
| FRC-11 | accepted residual | misaligned-root-cause bottleneck; fix rejected (would make adversarial DC-02 layoff proceed dangerously — `FRC11_FIX_DECISION.md`) |

All 6 abstain → escalate-to-human; **none is an unsafe or dangerous proceed**. They are
over-cautious, not unsafe.

## 7. REMAINING RISKS

1. **In-sample only.** Every metric is on the engine's own synthetic, self-authored
   benchmark — "zero unsafe proceeds" is not yet demonstrated on real-source or held-out
   data. (G9/G10)
2. **Corpus incomplete (103/150).** The unbuilt 47 include the planned real/blind sets.
   (G8)
3. **Quality unverified.** No standard-compliant consultant-grade quality score; the
   only prior figure was retracted. (G7/G11)
4. **RC-7 semantic residue.** The gate detectors are deterministic lexical/numeric
   heuristics; a cue-free, benign-looking, constraint-feasible wrong recommendation could
   still pass — bounded but not eliminated.
5. **Protected-hold dependence.** Safety on several adversarial cases (e.g. DC-02 layoff)
   depends on inadvertent guards (e.g. the bottleneck pattern's retention co-requirement),
   which are correct today but fragile to future trigger changes.

## 8. RECOMMENDED STATUS

**PROMOTE_TO_INTERNAL_OWNER_MODE_TRIAL_ONLY** — the lowest non-blocked rung. The safety
gates (G1–G6) are fully and machine-verifiably satisfied on the entire available corpus,
which is sufficient for a **human-supervised, advisory-only internal trial** but NOT for
any validation/alpha/public/paid status (G7–G11 unmet). This is **NOT** a Stage A pass.

## 9. WHAT IS ALLOWED NEXT

- Internal, owner-supervised, **advisory-only** trial on the owner's own real data, with
  a human reviewing every committed recommendation and the gate free to abstain.
- Building the remaining 47 corpus cases and the real-source verification set (separate
  authorized slices).
- Stage B groundwork that does not depend on a Stage A public launch.

## 10. WHAT IS FORBIDDEN NEXT

- Any public, self-serve, or paid use.
- Any "validated / consultant-grade / Stage A pass" claim.
- Acting on a committed recommendation without human review during the trial.
- Loosening any safety gate, diagnosis trigger, or threshold to raise commit rate.
- Authoring/altering benchmark cases or answer keys to improve scores.
