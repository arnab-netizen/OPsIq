# ABSTENTION GATE — HOSTILE AUDIT

**Date:** 2026-06-17

Adversarial answers to each mandated question, with evidence.

---

### 1. Did abstention trigger only when evidence was insufficient?
**Mostly yes; one defensible exception.** 4 abstentions fired:
- ADV-013, ADV-014, BLND-008 → ground truth IS insufficient_evidence. Correct.
- BLND-009 → ground truth is operational_bottleneck (a real diagnosis), so this is a **wrong abstention**. However: its evidence has a 1.4 missing-data density (genuinely hedge-heavy M&A/exit text), and its correct diagnosis is structurally unreachable (no operational_efficiency/team_capability dimension). The gate behaved per its principle; the case is genuinely under-determined by the supplied evidence dimensions.

No abstention fired on any of the 10 valid-correct cases.

### 2. Did it remove false-high-confidence wrong answers?
**Partially — 1 of 2.** ADV-014 (operational_bottleneck @ 50, GT insufficient) is removed. ADV-011 (unit_economics_breakdown @ 50, GT insufficient) **remains** — it is structurally identical to valid-correct PD-017 and cannot be caught without regressing PD-017 (documented limitation). The other @50 wrong answers (RW-016, RW-022, PD-019) are ranking failures on real-diagnosis cases, not abstention targets.

### 3. Did any valid-correct case wrongly abstain?
**No.** All 10 mapping-fix valid-correct cases remain concrete and correct (verified in benchmark + a dedicated regression test). Max valid-correct missing-data density is 0.6 (< Rule B's 1.0), and all have patternCount >= 1 (so Rule A cannot fire).

### 4. Did it hide hard cases instead of improving reasoning?
**Partially, and disclosed.** BLND-009 and (in an earlier iteration) RW-024 are "hard" cases whose correct diagnoses the engine cannot currently reach. The gate converts BLND-009 from a confident-ish wrong answer (TQC @ 29) to an honest abstention. This is *safer* but does not *solve* the case. It is flagged as a known limitation, not presented as a fix. RW-024 is NOT abstained (its evidence has zero missing-data language), so it remains a visible failure rather than being hidden.

### 5. Did it create an abstention lazy default?
**No.** Abstention fired on only 4/21 cases. INSUFFICIENT_EVIDENCE prediction count (4) tracks the ground-truth insufficient count (4). The triggers require explicit missing-data language and/or zero pattern support — not a catch-all. Tests 5 and 6 prove strong/clean diagnoses do not abstain.

### 6. Did it preserve evidence traceability?
**Yes.** Average trace rate unchanged at 98.1% (>= 85%). The abstention hypothesis carries `supportingEvidenceCount`, `conflictingEvidenceCount`, pattern fields, and a reasoning string naming the missing data; original candidates are retained at lower ranks.

### 7. Did confidence inflate?
**No.** Confidence cap (65) intact; abstention emitted at a fixed low 20. Average confidence essentially flat (~41.5). No scoring formula was touched.

### 8. Did any protected artifact change?
**No.** Answer keys, frozen Stage A outputs, prior slice benchmark outputs, the mapping-fix engine logic, scoring formula, keyword logic, and diagnosis mappings are all unchanged. New benchmark written to a NEW directory (`stage_a_abstention_gate_outputs/`).

### 9. Should the abstention gate remain, be revised, or be reverted?
**REMAIN.** It delivers +3 accuracy (10→13/21), removes a false-high-confidence wrong answer, introduces zero valid-correct regressions and zero new test failures, preserves the confidence cap and traceability, and is generalizable (no case-ID/answer-key coupling). Outstanding items (ADV-011, BLND-009, ranking failures) are out of this run's scope and are documented for future remediation.

---

## CONTAMINATION CHECK

`grep` of the gate code (`hypothesis-generator.ts` additions) for case IDs / answer-key strings / benchmark filenames: **NONE**. The missing-data phrase list contains only generic epistemic vocabulary describing absence of data.

## NET SAFETY ASSESSMENT

The gate is a **net safety improvement**: it converts confident wrong assertions on under-determined cases into explicit, reasoned abstentions, without sacrificing any correct diagnosis. The one residual safety gap (ADV-011 @ 50) is honestly disclosed and bounded.
