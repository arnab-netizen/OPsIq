# ROUND 2 — SOURCE-BACKING AUDIT OF THE 20 AUTHORED CASES

**Mode:** documentation only — no case deleted or rewritten; no engine/gate/scorer/
answer-key change. **Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Classifies every authored Round 2 case against `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md`.

---

## 1. HEADLINE FINDING
**0 of 20 cases are REAL_SOURCE_BACKED.** All were hand-authored with plausible but
**invented** figures and **no citations**. Therefore **all 20 carry the overlay
status NEEDS_SOURCE_BACKING**. They are structurally valid (intake validator 20/20)
and useful as a wiring/authoring proof, but they are **not** promotion-grade
evidence and must not be used to lift DO_NOT_PROMOTE.

## 2. PER-CASE CLASSIFICATION

| Case | Bucket | Grounding class | Source status | Re-ground target |
|---|---|---|---|---|
| R2-D01-S01 | cash_liquidity_crisis | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | SEC 10-K/8-K or restructuring |
| R2-D02-S01 | unit_economics_failure | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | startup postmortem / S-1 |
| R2-D03-S01 | margin_erosion | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | 10-K MD&A / earnings call |
| R2-D04-S01 | pricing_power | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | earnings call / journalism |
| R2-D05-S01 | demand_generation_failure | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | postmortem / journalism |
| R2-D06-S01 | gtm_channel_mismatch | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | postmortem / marketing-ROI dataset |
| R2-D07-S01 | customer_retention_erosion | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | churn dataset / 10-K |
| R2-D08-S01 | quality_trust_failure | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | recall / regulatory report |
| R2-D09-S01 | operational_bottleneck | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | ops turnaround case / journalism |
| R2-D10-S01 | inventory_forecasting_mismatch | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | 10-K inventory note / dataset |
| R2-D11-S01 | working_capital_stress | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | 10-Q / restructuring |
| R2-D12-S01 | debt_solvency_pressure | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | bankruptcy filing / lender docs |
| R2-D13-S01 | legal_governance_risk | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | regulatory enforcement action |
| R2-D14-S01 | key_person_risk | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | 10-K risk factors / postmortem |
| R2-D15-S01 | strategic_capex_risk | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | 10-K capex / impairment note |
| R2-MC-01 | bottleneck + retention (multi) | SYNTHETIC_BUT_REALISTIC | NEEDS_SOURCE_BACKING | journalism + ops report |
| R2-AB-01 | truly_insufficient (abstention) | PURE_SYNTHETIC | acceptable-as-synthetic* | keep synthetic, label |
| R2-AB-02 | no_single_cause (abstention) | PURE_SYNTHETIC | acceptable-as-synthetic* | keep synthetic, label |
| R2-ADV-01 | unit-economics discount (dangerous) | PURE_SYNTHETIC | needs pattern citation | ground to documented discount-death-spiral pattern |
| R2-ADV-02 | irreversible capex on surge (dangerous) | PURE_SYNTHETIC | needs pattern citation | ground to documented over-expansion failure |

\* Abstention probes test "no data / ambiguous" behavior; they are legitimately
synthetic **provided** they are explicitly labeled `source_type: synthetic`. They
do not require external figures (the point is the absence of figures), but they must
still be labeled, not left implicitly invented.

## 3. TALLY
- REAL_SOURCE_BACKED: **0**
- SYNTHETIC_BUT_REALISTIC: **16** (the 15 single + 1 multi)
- PURE_SYNTHETIC: **4** (2 abstention + 2 adversarial)
- NEEDS_SOURCE_BACKING (overlay): **20 / 20** (the 16 realistic must be re-grounded;
  the 2 adversarial need a documented failure-pattern citation; the 2 abstention
  need only an explicit `synthetic` label).

## 4. SPECIFIC GAPS PER STANDARD (§2 fields all currently absent)
Every case is missing: `source_url`/`citation`, `source_type`, `published/accessed
date`, `company_context`, `evidence_extracted`, `source_backed_metrics`,
`source_limitations`, `inferred_vs_stated`, `reliability_rating`,
`supports_ground_truth`, `contamination_risk`. No `source.json` exists for any case.

## 5. WHAT IS AND ISN'T INVALIDATED
- **Not invalidated:** the authoring/validation workflow, the intake validator, the
  diagnosis-trace harness, the schema, the §4 metadata fix, and the pilot
  abstention-lexicon lesson — all remain correct infrastructure.
- **Invalidated for promotion use:** the *evidentiary weight* of the 20 cases. They
  cannot support a capability or safety claim until re-grounded (or, for the 4
  probes, explicitly labeled synthetic and corroborated against a documented
  pattern).

## 6. DISPOSITION (no deletion now)
Per instruction, **nothing is deleted or rewritten.** The 16 SYNTHETIC_BUT_REALISTIC
cases are retained as scaffolding and queued for re-grounding under the sourcing
plan; the 2 adversarial probes are queued for failure-pattern citations; the 2
abstention probes are retained pending an explicit `source_type: synthetic` label.
A future authorized slice will add `source.json` records and reclassify.

**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
