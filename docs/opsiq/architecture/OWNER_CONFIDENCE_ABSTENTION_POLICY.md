# Owner Confidence / Abstention Policy

Code of record: `src/domain/owner-spine/owner-advice-policy.ts` (pure). Surfaced as `CurrentOwnerDecision.advicePolicy`
(`owner-decision.ts`). Tests: `src/__tests__/owner-spine/owner-advice-policy.test.ts`. Builds on
`OWNER_SCORE_COMPARABILITY_CONTRACT.md` (PR #582) and `OWNER_THRESHOLD_PROVENANCE.md` (PR #583).

## 1. What this is — and is not

Confidence in OpsIQ is a bounded **heuristic of evidence strength**. It is not a probability, it is not calibrated, and
nothing here changes that. This policy adds **no score, no formula and no threshold**, and it does **not** decide which
candidate wins (canonical ranking is unchanged). It answers one question: *given the elected target and the evidence behind
it, what may OpsIQ claim or recommend?* External guidance (e.g. NIST's idea that uncertainty must be communicated) was
used only as a design principle; no number is derived from any external source.

## 2. Claim types

| Claim type | Example | Evidence standard |
|---|---|---|
| `RECORDED_FACT` | an obligation is recorded as expired | the record itself |
| `CURRENT_MEASURED_CONDITION` | runway from a completed current snapshot | valid, current underlying data |
| `INFERRED_DIAGNOSIS` | cost leakage, weak conversion | relevant inputs + a deterministic rule |
| `RECOMMENDATION` | follow up receivables | a supporting diagnosis + applicability |
| `FORECAST_OR_PLAN` | a strategy will produce X | highest restraint: never stronger than `CAUTION`, never a commitment on heuristic strength |

## 3. Advice modes (seven, finite)

| Mode | Meaning | `canAct` | `canMakeMaterialCommitment` |
|---|---|---|---|
| `SUPPORTED` | current, sufficient evidence for this kind of claim | yes | yes |
| `CAUTION` | shown, but material uncertainty remains; names it | yes | only for non-growth, non-plan targets while business-wide data is not insufficient |
| `PROVISIONAL` | a real issue needs attention, but its score/diagnosis rests on incomplete or in-progress evidence | yes | no |
| `REFRESH_REQUIRED` | evidence is out of date; the target is to update/reconfirm it; the old diagnosis is never stated as current | yes (the refresh) | no |
| `EVIDENCE_REQUIRED` | critical information is missing; OpsIQ abstains from the material recommendation and asks for the named evidence | yes (supply it) | no |
| `RECORDED_FACT` | a recorded compliance/risk/safety fact, actionable as a fact; unrelated data gaps do not make it uncertain | yes | yes |
| `CONFLICT_REQUIRES_RESOLUTION` | Cash flow and Finance disagree and neither is more current | yes (reconcile) | no |

**Abstention does not mean showing nothing.** It means "OpsIQ cannot responsibly recommend this material decision from
current evidence", and it always carries: what is missing (`missingEvidence`), the next evidence action
(`nextEvidenceAction`), what recorded facts remain known (the rest of the decision), and when OpsIQ reassesses
(`reassessmentTrigger`). It composes existing decision facts (`missingInformation`, `reassessmentTrigger`, sufficiency,
stale/provisional domains, gate flags) rather than creating a parallel truth.

## 4. Decision table

| Evidence state | Claim type | Mode | Owner experience |
|---|---|---|---|
| no business data | — | `EVIDENCE_REQUIRED` | "Add your business numbers, then re-run" |
| missing critical target data (data-request target) | recommendation | `EVIDENCE_REQUIRED` | "OpsIQ cannot support this decision yet" + the named fields |
| stale evidence | diagnosis | `REFRESH_REQUIRED` | "Out of date — confirm the figures first"; shown as "last flagged", never as current |
| current + sufficient | diagnosis / recommendation | `SUPPORTED` | act normally |
| current + `caution` sufficiency | recommendation | `CAUTION` | act with the stated caveat; no probability wording |
| incomplete evidence in the target's own area | issue needing attention | `PROVISIONAL` | "needs attention now, but its score is provisional" |
| incomplete evidence only in *other* areas | recommendation | `CAUTION` (target area sufficient) | act with caveat; no money/plan commitment on growth targets |
| in-progress current-period cash/finance figures | measured condition | `PROVISIONAL` | may tighten safety; never clears a danger or approves growth |
| recorded compliance / owner-recorded risk / recorded safety block | recorded fact | `RECORDED_FACT` | resolve the control issue; unrelated analysis is stated as unavailable |
| Cash flow and Finance disagree, freshness cannot settle it | measured condition | `CONFLICT_REQUIRES_RESOLUTION` | "figures disagree — confirm which are authoritative"; the more cautious reading applies |
| strategy / plan target | forecast or plan | `CAUTION` at best | "a plan estimate, not a forecast"; no commitment |
| no open actions + stale or insufficient evidence | — | `REFRESH_REQUIRED` / `EVIDENCE_REQUIRED` | "nothing open" is **not** claimed |

## 5. Target-relevant versus unrelated missing data

The policy distinguishes the target's own evidence (`targetEvidence`): `TARGET_AREA_SUFFICIENT`, `TARGET_AREA_INCOMPLETE`,
`RECORDED_FACT`, `NOT_APPLICABLE`. A recorded fact never depends on diagnostic completeness. A target whose own area is not
flagged incomplete is `CAUTION` (not `PROVISIONAL`) when only other areas are short, and the policy says so. The dependency
graph is not invented: it uses the existing semantic class, source, source domain, the target's own `missingData`,
`lowConfidenceDomains`, the gate's own flags, and the target's intent (growth/plan targets never authorize a commitment while
business-wide data is short).

The **numeric** business-wide cap (insufficient → 40, caution → 70) is **unchanged** (an existing regression suite pins it).
So a well-supported unrelated-area target still *displays* a lower confidence figure while the policy says `CAUTION`; the
policy text explains why. Narrowing the numeric cap is recorded as a behavior-change candidate (section 8).

## 6. Stale, provisional, recorded and conflicting evidence

- **Stale:** out-of-date evidence cannot be current truth. The canonical election already replaces stale candidates with an
  `evidence_refresh` target (confidence cap 0.4, class and severity kept as "last flagged"); the policy maps it to
  `REFRESH_REQUIRED`, `requiresEvidenceRefresh`, and a card badge "Confirm the figures first" instead of a confidence label.
- **Provisional (in-progress period):** may tighten a safety check, never clears it or approves growth. A business with only
  an in-progress period is no longer told "advice rests on the latest completed period" when none exists.
- **Recorded facts:** compliance breaches, owner-recorded risks and recorded safety blocks stay actionable facts; the control
  center states that the recorded issue is unaffected by gaps elsewhere.
- **Conflict:** the gate already applies the worse reading as a fail-safe; the policy never averages and never picks a winner.
  The gate now exposes the existing `conflicting` fact (`gate.cash.conflicting`, additive) so the decision can say so.

## 7. Contradictions audit (classification)

| # | Finding | Class | Status |
|---|---|---|---|
| C1 | Control center says "do not make material decisions" while the gate/decision let a growth step proceed | REAL_DEFECT | Mitigated: policy withholds commitment for growth/plan targets (`canMakeMaterialCommitment=false`, card line). **Gate not changed** (candidate) |
| C2 | Business-wide missing data caps an unrelated, well-supported current target (numeric cap) | REAL_DEFECT (scope) | Policy distinguishes target-relevant vs unrelated (`CAUTION` + explanation). **Numeric cap unchanged** (pinned by tests; candidate) |
| C3 | A data-request target shown as "High confidence" | REAL_DEFECT | **Fixed** (card shows "Needs your information" / "Confirm the figures first") |
| C4 | High-confidence label beside stale evidence elsewhere; margin gate wording on stale figures is present tense | AMBIGUOUS / REAL (wording) | Policy adds the "other areas out of date" reason; margin gate wording left (candidate) |
| C5 | Now View / assessment / priority strip say "blocked / limited / safe to act" beside the card | REAL_DEFECT | Not changed (candidate: delegate to the policy) |
| C6 | Low confidence only changes a badge; growth/plan step unqualified | AMBIGUOUS | **Mitigated** (statement + no-commitment line from the policy) |
| C7 | Missing evidence read as no risk (danger cards read 0, portfolio growth candidate) | REAL_DEFECT | Not changed (candidate; portfolio/danger-band behavior is frozen) |
| C8 | Provisional-only wording; "nothing open" with stale evidence | REAL_DEFECT (wording) | **Fixed** |
| C9 | Different cutoffs/labels for the same score (75/80, 70, 30/45/60) | REAL_DEFECT (consistency) | Not changed (thresholds frozen; see provenance doc) |
| C10 | Percent/probability-style confidence wording outside the owner spine | AMBIGUOUS | Policy text is test-asserted free of percent/probability wording; other surfaces unchanged |
| C11 | Control center and decision read different sufficiency inputs | REAL_DEFECT | Policy passed through the control-center payload; sufficiency source unchanged (candidate) |
| C12 | Per-target confidence lost for supporting steps / lists | design gap | Not changed |

## 8. Behavior changes in this slice, and candidates left for later

**Implemented (copy / presentation / additive field only; no number, rank or threshold changes):**
1. `CurrentOwnerDecision.advicePolicy` (additive, deterministic, no persistence).
2. `OwnerDecisionCard`: a refresh / evidence-request / conflict target shows a policy label instead of a confidence label; non-supported modes show the statement and next evidence action; "nothing open" is qualified when evidence is stale or missing.
3. Provisional-only wording no longer claims a completed period exists.
4. Control center passes the policy through and states a recorded fact is unaffected by gaps elsewhere.
5. `gate.cash.conflicting` (additive optional field set from the existing reading).

**Candidates (not implemented):** narrow the numeric business-wide cap to the target-relevant domains; make the action gate and portfolio fail closed on missing evidence; delegate Now View / assessment / priority-strip confidence notes to the policy; single sufficiency source for the control center; margin-gate stale wording; per-target confidence for supporting steps. None touches a frozen threshold without its own validated PR.

## 9. Examples

- *Compliance licence recorded as expired while Marketing data is thin:* `RECORDED_FACT` — "This is a recorded fact, not an estimate." The recorded confidence is not capped.
- *Cashflow danger flagged 60 days ago:* `REFRESH_REQUIRED` — "last flagged: Critical"; "Update the Cashflow figures and re-run its diagnosis." Never "your cash runs out".
- *No sales, cost or cash data:* `EVIDENCE_REQUIRED` — "Add your business numbers (sales, costs and cash), then re-run OpsIQ."
- *Cash and Finance disagree with no way to tell which is newer:* `CONFLICT_REQUIRES_RESOLUTION` — "Confirm which figures are authoritative: update the older of Cash flow and Finance, then re-run both."
