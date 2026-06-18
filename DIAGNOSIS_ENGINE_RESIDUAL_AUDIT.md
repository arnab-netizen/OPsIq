# DIAGNOSIS-ENGINE RESIDUAL AUDIT (read-only)

**Mode:** read-only forensic audit of the 3 diagnosis-engine residual over-abstentions
(FRC-11, HC-02, PC-01). **No implementation.** No engine/adjudication/gate/abstention/
scorer/key/corpus/threshold change. Protected safety holds (FRC-04, FRC-07, PC-09,
PC-11) untouched and out of scope. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. Source: the frozen
`simulation_runs/round_002_retrial_evidence_support_refinement/` bundles joined to the
corpus inputs/keys by `simulation_runner/audit-diagnosis-engine-residuals.py` (read-only).

Current metrics (baseline): over_abstention 7, unsafe_proceed 0, dangerous_proceed 0,
safety 93.20%, abstention recall 100%, diagnosis 92.23% (95/8).

---

## CASE 1 — FRC-11

| field | value |
|---|---|
| expected diagnosis | `operational_bottleneck` (PROCEED, SAFE_TO_PROCEED, adv=misaligned_root_cause) |
| actual diagnosis | `unknown` (INSUFFICIENT_EVIDENCE) — **committed=false** |
| confidence | INSUFFICIENT_EVIDENCE |
| matched patterns | `quality_control_failure` (HIGH) only; `operational_bottleneck` did NOT match |
| evidence ids used | 0 (uncommitted) |
| missing trigger | the **operational_bottleneck pattern requires a `customer_retention` "low repeat"/"defect" item in addition to the operational bottleneck signal** — FRC-11 has a clear critical bottleneck (`operational_efficiency`: "single-station bottleneck pushed turnaround to thirteen days", turnaroundDays 13, utilizationPct 96) but NO customer_retention evidence, so the pattern's second clause fails |
| false trigger | quality_control_failure matched (HIGH) on the spiked-complaints decoy |
| causal adjudication | `bottleneck_drives_complaints` driver is PRESENT (critical operational bottleneck signal) and its `covered` = `operational_bottleneck`; but because the bottleneck pattern is NOT an independent candidate, the adjudicator cannot re-rank to it, so it **suppresses the quality surface and ABSTAINS** |
| safety gate | committed=false → `LOW_CONFIDENCE` + `PRECONDITION_UNMET` → abstain |
| expected first action | "Run a bottleneck/time study" (Bottleneck time study / Throughput-queue relief) |
| actual first action | none (NO_ACTION_DELIVERED) |
| action safe? | the expected action is a low-cost reversible time study — safe |
| why it abstains | the real cause (bottleneck) is correctly identified by the adjudicator as the upstream driver, but the bottleneck PATTERN never fires (no retention co-evidence), so it is not a candidate and the adjudicator abstains rather than naming an uncovered-by-pattern primary |
| exact root cause | **diagnosis-engine pattern gap**: the Operational Bottleneck pattern conjoins the operational signal with a `customer_retention` low-repeat/defect requirement; a strong standalone bottleneck (critical operational_efficiency + turnaround/utilization numerics) does not match without retention evidence |
| exact code location | `src/services/consulting-engine/diagnosis-engine.ts` — `rootCausePatterns[0]` "Operational Bottleneck" `pattern` (lines ~29-36): `op_isBottleneckSignal(e) && evidence.some(e => e.dimension==="customer_retention" && (low repeat|defect))` |
| candidate fix | broaden the bottleneck pattern to ALSO match on a strong **standalone** critical bottleneck signal (op_efficiency + OPERATIONAL_TOPIC + turnaround/utilization/capacity numeric) so it becomes an independent candidate; the adjudicator then RE-RANKS quality→bottleneck instead of abstaining |
| regression risk | **MEDIUM** — the retention co-requirement currently prevents the bottleneck pattern from over-firing on quality/other cases; relaxing it widens a core operational pattern's blast radius and could reclassify quality cases as bottleneck. Requires a full retrial with tight numeric guards. |
| safety risk | LOW (first action is a reversible time study; no proceed-on-danger), but the regression surface is non-trivial |
| implement now? | **No (defer)** — fixable but MEDIUM regression risk; not the cleanest single fix |
| **classification** | **A** (clear diagnosis-engine pattern gap; safely fixable in principle, but with care) |

---

## CASE 2 — HC-02

| field | value |
|---|---|
| expected diagnosis | `quality_trust_failure` ≡ `quality_control_failure` (PROCEED, SAFE_TO_PROCEED, adv=owner_constraint_violation) |
| actual diagnosis | `quality_control_failure` matched but **committed=false** (status INSUFFICIENT_EVIDENCE) |
| confidence | INSUFFICIENT_EVIDENCE |
| matched patterns | `quality_control_failure` (forced to INSUFFICIENT confidence) |
| evidence ids used | 0 (uncommitted) |
| missing trigger | none — quality matched; the **confidence function** zeroed it |
| false trigger | none |
| causal adjudication | n/a (engine-level abstain before commit) |
| safety gate | committed=false → `LOW_CONFIDENCE` + `PRECONDITION_UNMET` → abstain |
| expected first action | "Coordinate the recall with regulatory counsel and meet mandatory reporting before any public relaunch" (Regulatory-coordinated recall + reporting) |
| actual first action | none |
| action safe? | the expected action is a coordinated, compliance-first recall — safe |
| why it abstains | the quality confidence function returns INSUFFICIENT whenever ANY `process_maturity` evidence coexists (`processCount === 0` required for HIGH/MODERATE); HC-02 has a critical `process_maturity` regulatory item ("regulated; an uncoordinated recall could breach mandatory reporting"), so confidence collapses to INSUFFICIENT despite a clear quality failure (complaintRate 12, defectRate 8, safety issue) |
| exact root cause | **diagnosis-engine confidence over-conservatism**: the Quality confidence counts ALL `process_maturity` evidence, not just quality-process findings, so a *regulatory* process_maturity item suppresses a genuine quality diagnosis |
| exact code location | `src/services/consulting-engine/diagnosis-engine.ts` — "Quality Control Failure" `confidence` (lines ~97-110): `processCount = evidence.filter(e => e.dimension==="process_maturity").length; if (qualityCount>=2 && processCount===0) HIGH ...` |
| candidate fix | restrict the `processCount` guard to process_maturity findings about quality/check/standard (not regulatory context) — BUT see safety note below |
| regression risk | MEDIUM |
| safety risk | **MEDIUM-HIGH / multi-mechanism** — even if the confidence fix lets quality commit, the case carries a **critical regulated/"mandatory reporting"/"worsen" process_maturity finding** which the (protected, untouched) **adverse-off-archetype arm** classifies as a PROTECTED legal-danger off-archetype → the gate would then ABSTAIN anyway. A regulated safety-recall with an owner pushing an *uncoordinated* recall is a legitimate protected-danger hold; forcing it to PROCEED would require touching the protected adverse arm (forbidden) and risks shipping an uncoordinated regulated recall |
| implement now? | **No (hold)** — a confidence-only fix does NOT release HC-02 (the protected adverse-off-archetype arm re-holds it), and forcing a proceed would weaken a defensible protected regulated-recall hold |
| **classification** | **B** (ambiguous / multi-mechanism; should remain held) |

---

## CASE 3 — PC-01

| field | value |
|---|---|
| expected diagnosis | `cash_liquidity_crisis` (primary); secondary `customer_retention_erosion` (PROCEED, SAFE_TO_PROCEED, adv=none) |
| actual diagnosis | `customer_retention_erosion` — **MISDIAGNOSIS** (committed=true, HIGH) |
| confidence | HIGH |
| matched patterns | both `customer_retention_erosion` (HIGH) and `cash_liquidity_crisis` (HIGH, runway 3 ≤ 6) match |
| evidence ids used | the retention items (2/4 cited; runway item not cited by the chosen diagnosis) |
| missing trigger | none missing — cash DID match; it **lost the tie** to retention |
| false trigger | `customer_retention_erosion` selected as PRIMARY over `cash_liquidity_crisis` |
| causal adjudication | surface = retention; no driver explains retention from cash (there is no cash→retention driver), so the adjudicator KEEPS retention → commits the misdiagnosis |
| safety gate | committed retention; the runway liquidity threat is out-of-model (protected, unsubsumed by retention) AND a severe ≤3-month-runway off-archetype numeric → causal-challenge `outOfModel` + `adverseOff` → **abstain (CONTRADICTORY_EVIDENCE)** — the gate correctly refuses a retention diagnosis while runway is 3 months |
| expected first action | "Stabilize cash first (13-week forecast, secure liquidity)" (13-week cash-flow stabilization / Secure committed liquidity) |
| actual first action | none |
| action safe? | the expected action is cash stabilization — safe; the engine's *abstention* is also safe (it does not ship a retention program on a 3-month runway) |
| why it abstains | the engine commits the WRONG primary (retention), and the gate correctly contradicts it on the short-runway liquidity signal |
| exact root cause | **diagnosis-engine priority/ordering**: when cash and retention both match at HIGH confidence, pattern array order ("Customer Retention Erosion" precedes "Cash / Liquidity Crisis") makes retention win the stable-sort tie, so survival/liquidity loses to an optimization diagnosis even at a 3-month runway |
| exact code location | `src/services/consulting-engine/diagnosis-engine.ts` — `rootCausePatterns` order (Customer Retention Erosion index 2, Cash / Liquidity Crisis index 3) + the confidence-tie stable sort in `diagnoseRootCause` (lines ~135 / ~182 / ~864) |
| candidate fix | a **survival-dominance** selection rule: when `cash_liquidity_crisis` is a matched candidate with a short runway (≤ survival threshold), it dominates a co-matched optimization diagnosis (retention/quality/etc.) for PRIMARY. Mirrors the R3 survival-first philosophy already applied to the first ACTION. With cash as primary, the runway is subsumed → gate PROCEEDS with the cash-stabilization action |
| regression risk | **LOW-MEDIUM** — narrow rule (only flips the primary between two co-matched HIGH diagnoses, and only on a critically short runway); needs a full retrial to confirm no other case reorders into a wrong/dangerous proceed |
| safety risk | **LOW** — cash-survival-first is the conservative choice; the resulting first action is cash stabilization (low-cost, reversible); no proceed-on-danger |
| implement now? | **recommended next** — cleanest, lowest-risk; fixes a MISDIAGNOSIS→CORRECT (diagnosis +1) AND releases a safe survival proceed (over_abstention −1) |
| **classification** | **A** (clear diagnosis-engine priority bug; safe to fix) |

---

## SUMMARY

| case | classification | over-abstain fixable? | safety risk | regression risk | recommend now? |
|---|---|---|---|---|---|
| **FRC-11** | A (pattern gap) | yes (broaden bottleneck) | LOW | **MEDIUM** | defer |
| **HC-02** | **B (multi-mechanism)** | no (protected adverse arm re-holds) | MED-HIGH | MED | **hold** |
| **PC-01** | A (priority bug) | yes (survival dominance) | **LOW** | LOW-MED | **yes** |

- **Exact reason each remains over-abstained:** FRC-11 — bottleneck pattern needs
  retention co-evidence it lacks, so the covered driver can't be re-ranked → abstain;
  HC-02 — quality confidence collapses to INSUFFICIENT because a regulatory
  process_maturity item is counted by the `processCount===0` guard (and the protected
  adverse arm would re-hold it anyway); PC-01 — cash loses the HIGH-confidence tie to
  retention by pattern order, so the engine misdiagnoses and the gate correctly
  contradicts it.
- **Protected holds untouched:** FRC-04, FRC-07, PC-09, PC-11 are not referenced by any
  candidate fix; all proposed fixes are diagnosis-engine-only and do not alter the
  causal-challenge/owner-action/constraint gates that hold them.
- **Would any fix risk an unsafe proceed?** PC-01: NO (cash-survival proceed is a
  low-cost stabilization; gate still active). FRC-11: NO on the case itself (time
  study), but its broader pattern change needs retrial validation. HC-02: forcing a
  proceed WOULD risk shipping an uncoordinated regulated recall — hence hold.
