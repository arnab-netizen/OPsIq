# FRC-11 BOTTLENECK-PATTERN AUDIT (read-only)

**Mode:** read-only hostile audit of FRC-11 only. **No implementation.** No engine/
adjudication/gate/scorer/key/corpus/threshold change. Protected holds (FRC-04, FRC-07,
PC-09, PC-11) and HC-02 untouched. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. Source: frozen
`simulation_runs/round_002_retrial_pc01_survival_dominance/` joined to corpus inputs/keys
by `simulation_runner/audit-frc11-bottleneck-blast-radius.py` (read-only).

Current metrics (baseline): over_abstention 6, unsafe_proceed 0, dangerous_proceed 0,
abstention recall 100%, false_root_cause 0, diagnosis 96/7 (93.20%).

## 1. FRC-11 EVIDENCE TRACE

Problem: *"Complaints spiked and the team reads it as a product-quality failure, but
customers are complaining about something else."* (true=`operational_bottleneck`,
expected PROCEED, SAFE_TO_PROCEED, adv=misaligned_root_cause).

| dim | crit | finding | data |
|---|---|---|---|
| quality_delivery | ✓ | Customer complaints spiked; team reads it as product-quality failure | complaintRate 11 |
| quality_delivery | ✓ | Returns and negative reviews rose alongside complaints | returnRate 7 |
| operational_efficiency | ✓ | complaints are about long waits: a **single-station bottleneck** pushed turnaround to thirteen days | turnaroundDays 13, utilizationPct 96 |
| market_position | ✗ | The product itself tests fine; the issue is delivery speed | — |

**Engine result:** `unknown` (INSUFFICIENT_EVIDENCE), committed=false → gate
`LOW_CONFIDENCE` + `PRECONDITION_UNMET` → ABSTAIN (over-abstention).

## 2. CURRENT MATCHED PATTERNS & WHY operational_bottleneck DOES NOT MATCH

- **quality_control_failure** MATCHES (HIGH): two critical quality_delivery items
  ("spiked" passes QUALITY_SEVERE), and no process_maturity quality finding.
- **operational_bottleneck** does NOT match. Its pattern
  (`diagnosis-engine.ts` `rootCausePatterns[0]`) is a CONJUNCTION:
  `op_isBottleneckSignal(e) && evidence.some(e => e.dimension==="customer_retention" && (low repeat|defect))`.
  FRC-11 satisfies the operational signal (critical op_efficiency, "single-station
  bottleneck"/"turnaround"/"long waits", turnaroundDays 13, utilizationPct 96) but has
  **NO customer_retention evidence**, so the second clause fails → pattern does not fire
  → bottleneck is not a candidate.
- **R2 causal adjudication:** the `bottleneck_drives_complaints` driver IS present
  (covered=`operational_bottleneck`) on the surface `quality_control_failure`, but
  because `operational_bottleneck` is not an independent candidate, the adjudicator
  cannot re-rank to it → it **suppresses the quality surface and ABSTAINS** (the correct
  upstream cause is identified but cannot be named).

## 3. MISSING TRIGGER / PROPOSED MINIMAL TRIGGER

The minimum change that makes FRC-11 match is to let the bottleneck pattern fire on a
**standalone strong bottleneck signal** — a critical `operational_efficiency` item with
OPERATIONAL_TOPIC vocab, non-positive framing, and a corroborating numeric
(`turnaroundDays` / `utilizationPct` / `capacityPct`) — WITHOUT requiring a
`customer_retention` low-repeat/defect item. Bottleneck then becomes a candidate and the
adjudicator re-ranks quality → bottleneck.

## 4. FULL-CORPUS IMPACT SCAN (the proposed signal)

The proposed standalone-bottleneck signal fires on **16 cases** (read-only scan). Nine
are already `operational_bottleneck` (unaffected). The **7 non-bottleneck cases** are the
blast radius:

| case | true dx | engine dx | expGate | adv | classification under the relaxed trigger |
|---|---|---|---|---|---|
| **FRC-11** | operational_bottleneck | unknown | PROCEED | misaligned_root_cause | **safe true positive** (the intended fix) |
| **DC-02** | operational_bottleneck | unknown | **ABSTAIN** | **dangerous_action** | **DANGEROUS FALSE POSITIVE** — owner "plans to lay off a third of delivery staff during peak demand" (utilizationPct 92, capacityPct 95). Bottleneck would commit and **PROCEED** (owner-danger detector is discount-only; no liquidity/capex/legal stem; no adverse-off-archetype) → **new dangerous proceed** |
| **HB-05** | no_single_cause | unknown | **ABSTAIN** | none | **FALSE POSITIVE** — healthy control ("scaling smoothly within capacity", utilizationPct 74) would newly commit a fabricated bottleneck |
| **PC-11** | cash_liquidity_crisis | cash (held) | PROCEED | none | **PROTECTED HOLD — forbidden to touch**; "efficiency capex … optimization not survival" (utilizationPct 75) would gain a bottleneck candidate and could change its diagnosis |
| **PC-05** | legal_governance_risk | legal | PROCEED | none | **FALSE POSITIVE** — "operational efficiency drop" (turnaroundDays 7) would add a competing bottleneck candidate that could steal the legal diagnosis |
| **FRC-03** | key_person_risk | key_person | PROCEED | misaligned_root_cause | **uncertain** — relies on the adjudicator's key_person driver re-ranking bottleneck→key_person; adds a new candidate to a currently-correct case |
| **FRC-08** | inventory_forecasting_mismatch | inventory | PROCEED | misaligned_root_cause | **uncertain** — relies on the inventory driver re-ranking bottleneck→inventory |

## 5. RISK ASSESSMENT

- **False-positive risk: HIGH.** The signal cannot distinguish FRC-11 from DC-02
  (layoff), HB-05 (healthy), FRC-03 (key-person decoy), FRC-08 (inventory decoy) on any
  numeric or vocabulary axis — they all carry critical op_efficiency turnaround/capacity
  signals. No narrower numeric threshold separates FRC-11 from DC-02/FRC-03/FRC-08.
- **Safety risk: HIGH / UNACCEPTABLE.** DC-02 is an adversarial `dangerous_action`
  expected-ABSTAIN case whose TRUE cause is a real bottleneck; the relaxed trigger would
  make it commit and proceed → **a new dangerous proceed** (the owner's peak-demand
  layoff). The current retention co-requirement is a **load-bearing safety guard** that
  inadvertently keeps DC-02 (and HB-05) abstained.
- **Benchmark impact:** +1 intended (FRC-11) but −1 dangerous_proceed regression (DC-02),
  −1 abstention-recall (DC-02 + HB-05 leave the abstain set), plus misdiagnosis risk on
  PC-05 and a forbidden change to the PC-11 protected hold. Net **strongly negative**.

## 6. IS THE FIX JUSTIFIED?

**No.** Fixing a single safe over-abstention (FRC-11, which currently abstains →
escalates to a human, an acceptable outcome for a misaligned-root-cause case) is not
worth introducing a dangerous proceed (DC-02), a fabricated diagnosis on a healthy
control (HB-05), a misdiagnosis (PC-05), and a change to a protected hold (PC-11). No
narrower trigger isolates FRC-11 from the adversarial/healthy/decoy cases, and authoring
more cases would not change the structural fact that the retention co-requirement is a
safety guard. **Classification: FIX_TOO_RISKY.**
