# SOP / Training Effectiveness Loop — STATUS UPDATE

**Status:** implemented on latest main (after #132), locally green, CI-gated.

## What shipped
OpsIQ now evaluates whether SOP/checklist corrections and training assignments worked, by comparing the
targeted problem's metric in the previous owner-guidance snapshot (baseline) against the current one.
Surfaced as `sopTrainingEffectiveness` + a "Did the fixes work?" panel on `/owner/process-intelligence`.

## Governance posture
- No improvement claimed without before/after data + a met minimum-data threshold.
- Proposal-only corrections are not scored as implemented (INSUFFICIENT_DATA, honest summary).
- No fabricated improvement, no fake money figure, no fraud/negligence labels, no hidden score. No schema change.

## Classification
`SOP_TRAINING_EFFECTIVENESS_LOOP_REAL_AND_OWNER_VISIBLE`.
