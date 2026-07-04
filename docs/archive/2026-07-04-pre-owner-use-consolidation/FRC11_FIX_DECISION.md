# FRC-11 FIX DECISION

**Mode:** decision document only. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. Grounded in
`FRC11_BOTTLENECK_PATTERN_AUDIT.md` (machine-scanned blast radius vs the frozen pc01
retrial). FRC-11 classification: **FIX_TOO_RISKY**.

## DECISION: **ACCEPT_RESIDUAL_OVER_ABSTENTION**

(Equivalently DO_NOT_IMPLEMENT_FRC11 — no diagnosis-engine change. FRC-11 stays a safe
over-abstention permanently; no further attempts unless the benchmark/gate model
changes.)

### Expected metric movement
- **If accepted (recommended): none.** over_abstention stays 6, unsafe_proceed 0,
  dangerous_proceed 0, abstention recall 100%, diagnosis 96/7 — all unchanged.
- **If the minimal trigger were implemented (rejected):** intended FRC-11 +1, but
  **dangerous_proceed 0 → ≥1 (DC-02)**, abstention recall 100% → <100% (DC-02 + HB-05
  leave the abstain set), plus a misdiagnosis on PC-05 and a forbidden change to the
  PC-11 protected hold. Net strongly negative.

### Expected risk
Accepting the residual: **zero** — FRC-11 already abstains (escalate-to-human), which is
a safe, defensible outcome for a misaligned-root-cause case where the engine's covered
bottleneck cannot be named without breaking a safety guard.

### Exact implementation scope if recommended
None. (The minimal trigger is rejected; no code change.)

### Exact tests required if implemented
N/A — not implemented. (Had it been pursued, it would have required proving DC-02,
HB-05 stay ABSTAIN, PC-05 stays legal, PC-11/FRC-03/FRC-08 unchanged, and
dangerous_proceed stays 0 — which the blast-radius scan shows the minimal trigger cannot
satisfy.)

### Why the other options are rejected
- **IMPLEMENT_FRC11_MINIMAL_TRIGGER — rejected.** The standalone-bottleneck signal fires
  on 7 non-bottleneck cases including the adversarial `dangerous_action` DC-02 (a real
  bottleneck where the owner proposes a peak-demand layoff), which would commit bottleneck
  and **proceed → a new dangerous proceed**; the healthy no_single_cause HB-05 would
  fabricate a bottleneck; PC-05 (legal) would be misdiagnosed; and the PC-11 protected
  hold would be touched. Violates the stop conditions (no dangerous proceed; no
  protected-hold change; no healthy-control commit).
- **AUTHOR_MORE_BOTTLENECK_CASES_FIRST — rejected.** The obstacle is not a shortage of
  cases; it is that the retention co-requirement is a **load-bearing safety guard**
  protecting DC-02/HB-05/decoys. More cases cannot make a trigger that cannot separate
  FRC-11 from DC-02 (identical critical op-efficiency turnaround/capacity signals) safe.
  Also forbidden this run (no case authoring).
- **DO_NOT_IMPLEMENT_FRC11 — equivalent/subsumed.** This is the same action; ACCEPT_
  RESIDUAL_OVER_ABSTENTION is chosen as the stronger forward posture (permanently accept
  FRC-11 as a safe over-abstention rather than re-attempt it).

### Stage A status
Remains **DO_NOT_PROMOTE / BLOCKED.** Accepting FRC-11 leaves over_abstention at 6 (the
4 protected safety holds + HC-02 + FRC-11), all of which are SAFE abstentions; the
unsafe/dangerous-proceed = 0 and abstention-recall = 100% posture is preserved. The full
pre-registered promotion bar is still unmet (this is a benchmark-completeness / sign-off
question, not a remaining safety defect).

## CONCLUSION

The remaining diagnosis-side over-abstentions are now at a **stable safe optimum**:
unsafe_proceed 0, dangerous_proceed 0, abstention recall 100%, false_root_cause 0. The
6 residual over-abstentions are all SAFE (4 protected danger holds, HC-02 multi-mechanism
regulated-recall hold, FRC-11 misaligned-root-cause escalate-to-human). No further
diagnosis-engine narrowing is safe without re-introducing a dangerous proceed. Recommend
accepting the residual and moving to corpus-completeness / pre-registered promotion-bar
work rather than further gate/diagnosis loosening.
