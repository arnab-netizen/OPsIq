# ROUND 2 — SOURCE COLLECTION SLICE 1 REPORT

**Mode:** source-record collection only — **no full benchmark cases authored**, no
scorer, no engine/gate/answer-key change. **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Implements `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md`, `ROUND_2_REAL_CASE_SOURCING_PLAN.md`,
and `ROUND_2_OUTCOME_SPECTRUM_REQUIREMENTS.md`. Produces **candidate source records**
(provenance only) — these are NOT yet benchmark cases and carry no answer keys/inputs.

---

## 0. RESULT
**36 candidate source records collected** (target ≥ 30), saved as
`simulation_runs/round_002_source_candidates/slice_1/SRC-001.json … SRC-036.json`
with a machine index at `_SLICE_1_INDEX.json`. All 36 are valid JSON with every
required field present (verified programmatically).

## 1. COVERAGE vs SLICE-1 TARGETS
| Target | Required | Achieved |
|---|---|---|
| Source records | ≥ 30 | **36** |
| Outcome categories | ≥ 10 | **15** (1,2,4,6,8,9,11,12,13,14,15,17,18,19,20) |
| Diagnosis buckets | ≥ 8 | **13** of 15 |
| Business types | ≥ 5 | **~12** distinct (retail, asset-heavy, manufacturing, restaurant/QSR, franchise, DTC, ecommerce/startup, marketplace, SaaS, fintech, healthcare, public dataset/gov) |
| Source categories | ≥ 5 | **5** (SEC_FILING, GOVERNMENT_REPORT, PUBLIC_DATASET, JOURNALISM, FOUNDER_POSTMORTEM) |
| Reliability | — | **A=15, B=20, C=1** |

## 2. ⚠ VERIFICATION CAVEAT (binding on all 36 records)
**`WebFetch` returned HTTP 403 for every primary domain in this sandbox**
(sec.gov, bls.gov, treasury.gov, House committee, IBM, and major news sites). All
figures were therefore confirmed against **`WebSearch` result snippets** attributed
to those primary/credible domains, with cross-corroboration — **not** by reading the
full source text. Consequences:
- Reliability ratings are **provisional**. An "A" means *the underlying source is a
  primary SEC/government filing*, not that its full text was machine-read here.
- **No record may be promoted to a REAL_SOURCE_BACKED benchmark case** until a future
  slice (with working full-text fetch or manual review) re-verifies each
  `source_backed_metrics` figure against the actual source page/section/locator, per
  the standard's §9 dual-review. This slice delivers *candidates*, exactly as scoped.
- Every record's `source_limitations` field records this fetch constraint explicitly.
- No figure was invented; unverifiable numbers were omitted or flagged `inferred`.

## 3. RECORD INDEX (company · outcome · diagnosis · source · reliability)
| ID | Company/context | Outcome | Diagnosis bucket | Source type | Rel |
|---|---|---|---|---|---|
| SRC-001 | Toys 'R' Us | 2 bankruptcy | debt_solvency_pressure | JOURNALISM | B |
| SRC-002 | Sears Holdings | 2 bankruptcy | debt_solvency_pressure | JOURNALISM | B |
| SRC-003 | Hertz | 13 shock→recovery | debt_solvency_pressure | SEC_FILING | A |
| SRC-004 | General Motors (2009) | 4 turnaround | debt_solvency_pressure | GOVERNMENT_REPORT | A |
| SRC-005 | Revlon | 2 bankruptcy | working_capital_stress | JOURNALISM | B |
| SRC-006 | J.Crew | 2 bankruptcy | debt_solvency_pressure | JOURNALISM | B |
| SRC-007 | Fed Small Business Credit Survey | 20 ambiguous | working_capital_stress | GOVERNMENT_REPORT | A |
| SRC-008 | US Courts bankruptcy statistics | 2 bankruptcy | debt_solvency_pressure | PUBLIC_DATASET | A |
| SRC-009 | RadioShack | 1 failure | demand_generation_failure | JOURNALISM | B |
| SRC-010 | Pets.com | 19 unit-econ | unit_economics_failure | JOURNALISM | B |
| SRC-011 | Webvan | 17 capex mistake | strategic_capex_risk | JOURNALISM | B |
| SRC-012 | Quibi | 1 failure | demand_generation_failure | JOURNALISM | B |
| SRC-013 | Homejoy | 1 failure | customer_retention_erosion | JOURNALISM | B |
| SRC-014 | WeWork / The We Company | 6 hidden-profitability | unit_economics_failure | SEC_FILING | A |
| SRC-015 | Casper Sleep | 6 hidden-profitability | unit_economics_failure | SEC_FILING | A |
| SRC-016 | Groupon | 6 hidden-profitability | customer_retention_erosion | JOURNALISM | B |
| SRC-017 | Everpix | 1 failure | demand_generation_failure | FOUNDER_POSTMORTEM | B |
| SRC-018 | Jawbone | 14 demand collapse | unit_economics_failure | JOURNALISM | B |
| SRC-019 | Wirecard | 15 fraud/legal | legal_governance_risk | JOURNALISM | B |
| SRC-020 | Theranos | 15 fraud/legal | legal_governance_risk | SEC_FILING | A |
| SRC-021 | Luckin Coffee | 15 fraud/legal | legal_governance_risk | SEC_FILING | A |
| SRC-022 | Boeing 737 MAX | 18 quality/trust | quality_trust_failure | GOVERNMENT_REPORT | A |
| SRC-023 | Chipotle (2015) | 18 quality/trust | quality_trust_failure | SEC_FILING | B |
| SRC-024 | Domino's Pizza | 11 good action→improvement | quality_trust_failure | SEC_FILING | B |
| SRC-025 | Apple (1997) | 4 turnaround | cash_liquidity_crisis | JOURNALISM | B |
| SRC-026 | LEGO (2003-04) | 4 turnaround | margin_erosion | JOURNALISM | B |
| SRC-027 | Starbucks (2008) | 4 turnaround | operational_bottleneck | SEC_FILING | B |
| SRC-028 | Peloton (FY2022) | 8 growth→breakdown | inventory_forecasting_mismatch | SEC_FILING | A |
| SRC-029 | GoPro (FY2016) | 6 hidden-profitability | demand_generation_failure | SEC_FILING | A |
| SRC-030 | Blockbuster | 14 demand collapse | demand_generation_failure | JOURNALISM | C |
| SRC-031 | Best Buy (Renew Blue) | 4 turnaround | margin_erosion | SEC_FILING | A |
| SRC-032 | IBM Telco churn dataset | 20 ambiguous | customer_retention_erosion | PUBLIC_DATASET | B |
| SRC-033 | BLS Business Employment Dynamics | 12 stable-healthy | strategic_capex_risk (priors) | GOVERNMENT_REPORT | A |
| SRC-034 | Netflix (Qwikster 2011) | 9 mistake→correction | pricing_power | SEC_FILING | A |
| SRC-035 | Lululemon (2013 recall) | 18 quality/trust | quality_trust_failure | JOURNALISM | B |
| SRC-036 | Costco | 12 stable-healthy | operational_bottleneck | SEC_FILING | A |

## 4. ADVERSARIAL / KEY SUITABILITY
- `suitable_for_adversarial: true` flagged on the fraud/safety cases (Wirecard,
  Theranos, Luckin, Boeing) where the obvious action worsens the outcome — candidate
  grounding for dangerous-action probes (per outcome-spectrum §5).
- `suitable_for_hidden_key: true` on cases where the source can justify a ground-truth
  diagnosis + outcome; `keep_source_text_out_of_input: true` on all (identity/outcome
  would leak the answer).
- Two non-company calibration records (SRC-008 bankruptcy base rates, SRC-033 BLS
  survival rates) + two datasets (SRC-007, SRC-032) anchor base rates and the
  abstention/stable-healthy ends of the spectrum.

## 5. KNOWN GAPS (for slice 2+)
- **Diagnosis buckets not yet covered (2/15):** `gtm_channel_mismatch`,
  `key_person_risk` (WeWork carries key-person as a *secondary* note only).
- **Outcome categories not yet covered (5/20):** 3 severe-distress-survival,
  5 partial-recovery, 7 high-revenue-cash-crisis, 10 wrong-action-worsened,
  16 founder/key-person/team failure.
- **Reliability:** only 1 C-rated (Blockbuster); the standard allows C only with a
  second corroborating source — Blockbuster needs a corroborating primary before use.
- **Famous large-caps are over-represented** in this first pass; slice 2 must add
  small-business / mid-market / franchise cases to honor the ≤25% large-cap rule.

## 6. WHAT WAS AND WASN'T DONE
- **Done:** 36 provenance records with real URLs + snippet-verified figures, outcome
  + diagnosis labels, reliability, inferred-vs-stated, adversarial/key suitability.
- **Not done (by scope):** no benchmark `01_case_input.json`/`key.json` authored from
  these; no full-text fetch verification; no scorer; nothing promoted to
  REAL_SOURCE_BACKED.

## 7. NEXT STEP
Slice 2 source collection: (a) close the diagnosis gaps (gtm_channel_mismatch,
key_person_risk) and the 5 missing outcome categories; (b) add small-business /
mid-market / franchise sources to satisfy the ≤25% large-cap and business-type rules;
(c) corroborate the lone C-rated record. Then a **full-text verification slice**
(re-fetch each cited source, confirm every metric against a locator) before any record
is converted to a REAL_SOURCE_BACKED case. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
