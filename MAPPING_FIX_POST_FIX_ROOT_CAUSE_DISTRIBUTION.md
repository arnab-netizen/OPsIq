# MAPPING FIX — PHASE 6 POST-FIX ROOT-CAUSE DISTRIBUTION

**Date:** 2026-06-17

---

## BEFORE vs AFTER (13 originally-failing cases)

PHASE 2 (pre-fix) classified the 13 failures as: 9 "pattern generation / diagnosis-not-mapped" + 4 "ranking". On deeper inspection during this validation, the pre-fix "9 not-mapped" actually decompose into true-mapping-gaps, abstention cases, and dimension gaps. The table tracks each originally-failing case:

| Case | Pre-fix category | Post-fix status | Post-fix category |
|---|---|---|---|
| BLND-006 | mapping gap (DFM unreachable via fin+market) | **FIXED** | correct |
| BLND-010 | mapping gap (SPE unmapped) | **FIXED** | correct |
| BLND-008 | "not generated" | still failing | ABSTENTION_REQUIRED |
| ADV-011 | "not generated" | still failing | ABSTENTION_REQUIRED |
| ADV-013 | "not generated" | still failing | ABSTENTION_REQUIRED |
| ADV-014 | "not generated" | still failing | ABSTENTION_REQUIRED |
| BLND-009 | "not generated" | still failing | EVIDENCE_PATTERN_NOT_CREATED (dim) |
| RW-024 | "not generated" | still failing | EVIDENCE_PATTERN_NOT_CREATED (dim) |
| RW-016 | "not generated" | still failing | WRONG_CANDIDATE_TOO_HIGH (ranking) |
| ADV-012 | ranking | still failing | WRONG_CANDIDATE_TOO_HIGH (ranking) |
| RW-022 | ranking | still failing | WRONG_CANDIDATE_TOO_HIGH (ranking) |
| PD-019 | ranking | still failing | WRONG_CANDIDATE_TOO_HIGH (ranking) |
| SYN-013 | ranking | still failing | CANDIDATE_GENERATED_TOO_LOW (adoption/mapping) |

## DISTRIBUTION SHIFT

| Metric | Pre-fix | Post-fix |
|---|---|---|
| True mapping gaps (correct diagnosis literally had no pattern) | 2 (BLND-006 fin+market DFM, BLND-010 SPE) | **0** |
| Mapping gaps fixed | — | **2** |
| Abstention-required (insufficient_evidence, ungeneratable) | 4 (were mislabeled as "not generated") | 4 |
| Ranking failures (correct generated, outranked) | 4 | 4 (RW-016 reclassified into this group) |
| Dimension-not-created (upstream) | 2 (were mislabeled as "not generated") | 2 |
| Adoption/low-candidate (SYN-013) | 1 | 1 |

## ANSWERS TO PHASE 6 QUESTIONS

- **How many mapping failures were actually eliminated?** 2 (BLND-006, BLND-010) — i.e., 100% of the *true* diagnosis-not-mapped failures that were within reach without scoring/dimension changes.
- **How many mapping failures remain?** 0 true "diagnosis literally unmapped" failures. (SYN-013 is a partial-mapping/low-candidate case, not a hard unmapped gap — CRE is reachable but scored at floor.)
- **How many failures moved from mapping to ranking?** 1 (RW-016): now clearly a ranking-dominance failure rather than a generation failure.
- **How many failures are now ambiguity/abstention?** 4 (BLND-008, ADV-011, ADV-013, ADV-014) — all `insufficient_evidence` ground truth.
- **What is the next dominant bottleneck?** A **tie between ABSTENTION (4) and RANKING (4)**. Of these, the abstention gap is the more urgent because it produces **false high-confidence wrong answers** (ADV-011 UEB@50, ADV-014 OB@50) — a safety concern — and is structurally absent (no INSUFFICIENT_EVIDENCE output exists at all).

## CONCLUSION

The mapping fix did exactly what PRIORITY 1 scoped: it eliminated the reachable diagnosis-mapping gaps (2 cases) with zero regressions. The remaining failure surface is now cleanly separated into **abstention (4)**, **ranking (4)**, **dimension recognition (2)**, and **adoption mapping (1)** — none of which is a generic "diagnosis unmapped" problem. The single highest-value next target is an **abstention / insufficient-evidence gate**.
