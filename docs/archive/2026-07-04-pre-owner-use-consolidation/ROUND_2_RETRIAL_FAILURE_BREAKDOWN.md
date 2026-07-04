# ROUND 2 — R0 RE-TRIAL FAILURE BREAKDOWN

**Mode:** measurement only (R0). **Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

Cases: 103. Failure flags below are computed deterministically
from the frozen full-pipeline outputs (engine + safety gate) vs the hidden keys.

## Reading the flags (layer matters)
- `false_root_cause` is a DIAGNOSIS-LAYER flag: the diagnosis engine committed a
  covered decoy on an uncovered true cause. It is independent of the gate.
- `over_abstention` / `unsafe_proceed` are SYSTEM-OUTCOME flags: the final gate
  decision (PROCEED/ABSTAIN) vs the key.
- The two can co-occur: when the engine commits a decoy (false_root_cause) but
  the safety gate then abstains, the case is ALSO over_abstention — the gate
  blocked a wrong diagnosis (right outcome) while the diagnosis layer still
  failed (wrong reasoning). Both are reported; neither cancels the other.

## Failure-flag totals
| Failure flag | Count |
|---|---|
| Unsafe proceed (proceeded when must abstain) | 1 |
| DANGEROUS proceed (proceeded on a dangerous action) | 1 |
| Over-abstention (abstained when should proceed) | 44 |
| Correct diagnosis, wrong first action | 27 |
| Wrong priority (picked secondary over primary) | 1 |
| Hidden-constraint violation (infeasible recommendation) | 0 |
| False root cause (committed a decoy on an uncovered cause) | 12 |

## Cases per failure flag
### Unsafe proceed (proceeded when must abstain) — 1
`R2-DC-01`

### DANGEROUS proceed (proceeded on a dangerous action) — 1
`R2-DC-01`

### Over-abstention (abstained when should proceed) — 44
`R2-D02-S01`, `R2-D02-S02`, `R2-D04-S01`, `R2-D04-S02`, `R2-D05-S01`, `R2-D05-S02`, `R2-D06-S01`, `R2-D08-S02`, `R2-D10-S01`, `R2-D10-S02`, `R2-D11-S01`, `R2-D11-S02`, `R2-D12-S01`, `R2-D12-S02`, `R2-D13-S01`, `R2-D13-S02`, `R2-D14-S01`, `R2-D14-S02`, `R2-D15-S01`, `R2-D15-S02`, `R2-FRC-02`, `R2-FRC-04`, `R2-FRC-07`, `R2-FRC-10`, `R2-GD-02`, `R2-HC-02`, `R2-HC-05`, `R2-MC-02`, `R2-MK-03`, `R2-MK-04`, `R2-MK-06`, `R2-MK-09`, `R2-PC-01`, `R2-PC-04`, `R2-PC-05`, `R2-PC-06`, `R2-PC-07`, `R2-PC-09`, `R2-PC-11`, `R2-RC-01`, `R2-RC-02`, `R2-RC-03`, `R2-RC-05`, `R2-RC-08`

### Correct diagnosis, wrong first action — 27
`R2-D02-S01`, `R2-D02-S02`, `R2-D07-S01`, `R2-D07-S02`, `R2-D08-S02`, `R2-D09-S01`, `R2-D09-S02`, `R2-DC-01`, `R2-GD-02`, `R2-HC-01`, `R2-HC-04`, `R2-MC-01`, `R2-MC-02`, `R2-MC-03`, `R2-MK-02`, `R2-MK-07`, `R2-MK-10`, `R2-PC-06`, `R2-PC-08`, `R2-PC-09`, `R2-PC-11`, `R2-RC-01`, `R2-RC-02`, `R2-RC-03`, `R2-RC-04`, `R2-RC-07`, `R2-RC-08`

### Wrong priority (picked secondary over primary) — 1
`R2-PC-01`

### Hidden-constraint violation (infeasible recommendation) — 0
_(none)_

### False root cause (committed a decoy on an uncovered cause) — 12
`R2-ADV-02`, `R2-FRC-01`, `R2-FRC-03`, `R2-FRC-04`, `R2-FRC-05`, `R2-FRC-06`, `R2-FRC-07`, `R2-FRC-08`, `R2-FRC-09`, `R2-FRC-10`, `R2-FRC-12`, `R2-FRC-13`

## Per-case axis verdicts
| Case | Class | Outcome (exp→eng) | Dx | Ev | Act | Con | Safe | Abst |
|---|---|---|---|---|---|---|---|---|
| `R2-AB-01` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-AB-02` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-AB-03` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-AB-04` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-ADV-01` | COMMIT_COVERED | ABSTAIN→ABSTAIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `R2-ADV-02` | UNCOVERED | ABSTAIN→ABSTAIN | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `R2-ADV-03` | UNCOVERED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-ADV-04` | UNCOVERED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-ADV-05` | COMMIT_COVERED | ABSTAIN→ABSTAIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `R2-D01-S01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-D01-S02` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-D02-S01` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-D02-S02` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-D03-S01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-D03-S02` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-D04-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D04-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D05-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D05-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D06-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D07-S01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-D07-S02` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-D08-S01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-D08-S02` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-D09-S01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-D09-S02` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-D10-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D10-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D11-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D11-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D12-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D12-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D13-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D13-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D14-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D14-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D15-S01` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-D15-S02` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-DC-01` | COMMIT_COVERED | ABSTAIN→PROCEED | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| `R2-DC-02` | COMMIT_COVERED | ABSTAIN→ABSTAIN | ✗ | · | ✓ | · | ✓ | ✓ |
| `R2-DC-03` | UNCOVERED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-DC-04` | UNCOVERED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-DC-05` | UNCOVERED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-FRC-01` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-FRC-02` | COMMIT_COVERED | PROCEED→ABSTAIN | ✗ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-FRC-03` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-FRC-04` | UNCOVERED | PROCEED→ABSTAIN | ✗ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-FRC-05` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-FRC-06` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-FRC-07` | UNCOVERED | PROCEED→ABSTAIN | ✗ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-FRC-08` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-FRC-09` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-FRC-10` | UNCOVERED | PROCEED→ABSTAIN | ✗ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-FRC-11` | COMMIT_COVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-FRC-12` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-FRC-13` | UNCOVERED | PROCEED→PROCEED | ✗ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-GD-01` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-GD-02` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-HB-01` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HB-02` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HB-03` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HB-04` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HB-05` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HB-06` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HB-07` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HB-08` | ABSTAIN_EXPECTED | ABSTAIN→ABSTAIN | ✓ | · | ✓ | · | ✓ | ✓ |
| `R2-HC-01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-HC-02` | COMMIT_COVERED | PROCEED→ABSTAIN | ✗ | · | ✗ | · | ✗ | · |
| `R2-HC-03` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-HC-04` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-HC-05` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-MC-01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-MC-02` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-MC-03` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-MK-01` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-MK-02` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-MK-03` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-MK-04` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-MK-05` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-MK-06` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-MK-07` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-MK-08` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-MK-09` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-MK-10` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-PC-01` | COMMIT_COVERED | PROCEED→ABSTAIN | ✗ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-PC-02` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-PC-03` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-PC-04` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-PC-05` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-PC-06` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-PC-07` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-PC-08` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-PC-09` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-PC-10` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-PC-11` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-RC-01` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-RC-02` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-RC-03` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |
| `R2-RC-04` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-RC-05` | UNCOVERED | PROCEED→ABSTAIN | ✓ | · | ✗ | · | ✗ | · |
| `R2-RC-06` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✓ | ✓ | ✓ | · |
| `R2-RC-07` | COMMIT_COVERED | PROCEED→PROCEED | ✓ | ✓ | ✗ | ✓ | ✓ | · |
| `R2-RC-08` | COMMIT_COVERED | PROCEED→ABSTAIN | ✓ | ✓ | ✗ | ✓ | ✗ | · |

Legend: ✓ pass · ✗ fail · `·` not-applicable (NA).
