# ROUND 2 — SOURCE COLLECTION SLICE 3 REPORT

**Mode:** source-record collection only — **no benchmark cases authored**, no scorer,
no engine/gate/answer-key change, **no record promoted to REAL_SOURCE_BACKED**.
**Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Diversity / weak-coverage pass. Candidate provenance records only, under
`simulation_runs/round_002_source_candidates/slice_3/` (SRC-073…SRC-108).

---

## 0. RESULT
**36 new candidate records** (target ≥ 30), all valid JSON with the full extended
schema present. **Combined total: 108 records** (slice 1–3, 36 each).

## 1. PRIORITY-TARGET RESULTS (slice 3)
| Priority | Result |
|---|---|
| GOOD-outcome cases | **12** (SRC-073–081 + Costco/Nucor stable) → combined GOOD **23** |
| AMBIGUOUS / abstention-appropriate | **4** (SRC-082,083,089 + 097-adjacent) → combined AMBIGUOUS **8** |
| Stable-healthy (outcome 12) | Costco FY19, Nucor FY18, ONS, Census BFS |
| Small / private / franchise / mid-market | many (BHS, Patisserie Valerie, Dick Smith, KFC-UK franchise, SBA/WB SME) |
| Non-US | **9/9 in the dedicated batch** (UK ×5, South Africa/Germany, China, Australia, multi-country) |
| High-revenue cash-crisis (outcome 7) | Rivian, WeWork, Peloton, Evergrande, World Bank SME |
| Wrong-action-worsened (outcome 10) | Quaker/Snapple, Schlitz, Target glut, Tropicana |
| Inventory forecasting | Target FY22, Nike FY22-23, Walmart Q1FY23, Dick Smith |
| Working-capital stress | OECD, ONS, Tutor Perini, Fed SBCS, Peloton |
| Operational bottleneck | Nucor, Boeing 787, KFC-UK, Census BFS |
| Corroboration of 2 C-rated records | **done** — SRC-107 corroborates SRC-030 (Blockbuster); SRC-108 corroborates SRC-066 (Tropicana) |

## 2. ⚠ VERIFICATION STATUS (binding)
`WebFetch` returned **HTTP 403** for every primary domain again. All 36 slice-3
records are honestly `verification_status: SEARCH_SNIPPET_ONLY`. **0 FULL_TEXT_VERIFIED.**
**No record promoted to REAL_SOURCE_BACKED** (hard rule honored). Schlitz (SRC-103)
is C-rated (retrospective secondary on 1970s events) and flagged for corroboration.

## 3. SLICE-3 RECORD INDEX
| ID | Company/dataset | Geography | Outcome | Diagnosis | Source | Rel |
|---|---|---|---|---|---|---|
| SRC-073 | Microsoft (Nadella) | Global/US | 4 | strategic_capex_risk | SEC_FILING | A |
| SRC-074 | Adobe (subscription pivot) | Global/US | 11 | unit_economics_failure | SEC_FILING | A |
| SRC-075 | Target (2017+ turnaround) | US | 4 | demand_generation_failure | SEC_FILING | A |
| SRC-076 | McDonald's (2015 plan) | Global/US | 4 | demand_generation_failure | SEC_FILING | A |
| SRC-077 | Costco (FY2019 stable) | US | 12 | customer_retention_erosion | SEC_FILING | A |
| SRC-078 | Nucor (FY2018 stable) | US | 12 | operational_bottleneck | SEC_FILING | A |
| SRC-079 | Lululemon (post-recall recovery) | NA | 13 | quality_trust_failure | SEC_FILING | B |
| SRC-080 | Domino's (sustained growth) | US | 11 | demand_generation_failure | SEC_FILING | A |
| SRC-081 | Old Spice (rebrand) | US | 11 | demand_generation_failure | JOURNALISM | B |
| SRC-082 | World Bank Enterprise Surveys | 109 economies | 20 | working_capital_stress | PUBLIC_DATASET | A |
| SRC-083 | OECD SME Financing Scoreboard | ~50 countries | 20 | working_capital_stress | GOVERNMENT_REPORT | A |
| SRC-084 | UK ONS Business Demography | UK | 12 | working_capital_stress | GOVERNMENT_REPORT | A |
| SRC-085 | US Census Business Formation | US | 12 | operational_bottleneck | PUBLIC_DATASET | A |
| SRC-086 | Target (FY2022 inventory glut) | US | 10 | inventory_forecasting_mismatch | SEC_FILING | A |
| SRC-087 | Nike (FY22-23 inventory) | Global | 8 | inventory_forecasting_mismatch | SEC_FILING | A |
| SRC-088 | Tutor Perini (receivables) | US | 3 | working_capital_stress | SEC_FILING | B |
| SRC-089 | Aqua Metals (going-concern) | US | 20 | cash_liquidity_crisis | SEC_FILING | B |
| SRC-090 | Fed SBCS (employer firms) | US | 20 | working_capital_stress | GOVERNMENT_REPORT | A |
| SRC-091 | Carillion | UK | 2 | debt_solvency_pressure | GOVERNMENT_REPORT | A |
| SRC-092 | BHS | UK | 2 | debt_solvency_pressure | GOVERNMENT_REPORT | A |
| SRC-093 | Thomas Cook | UK | 2 | debt_solvency_pressure | GOVERNMENT_REPORT | A |
| SRC-094 | Patisserie Valerie | UK | 15 | legal_governance_risk | JOURNALISM | B |
| SRC-095 | Steinhoff | SA/Germany | 15 | legal_governance_risk | JOURNALISM | B |
| SRC-096 | Evergrande | China | 7 | debt_solvency_pressure | JOURNALISM | B |
| SRC-097 | World Bank SME pandemic study | Developing econ. | 7 | cash_liquidity_crisis | PUBLIC_DATASET | A |
| SRC-098 | KFC UK (DHL crisis) | UK | 13 | operational_bottleneck | JOURNALISM | B |
| SRC-099 | Dick Smith Electronics | Australia/NZ | 2 | inventory_forecasting_mismatch | BANKRUPTCY_RESTRUCTURING | B |
| SRC-100 | Rivian | US | 7 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-101 | WeWork (going-concern) | US | 7 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-102 | Quaker Oats / Snapple | US | 10 | gtm_channel_mismatch | JOURNALISM | B |
| SRC-103 | Schlitz Brewing | US | 10 | quality_trust_failure | JOURNALISM | C |
| SRC-104 | Boeing 787 production | US/Global | 8 | operational_bottleneck | JOURNALISM | B |
| SRC-105 | Walmart (Q1 FY23 inventory) | US | 8 | inventory_forecasting_mismatch | EARNINGS_CALL | B |
| SRC-106 | Peloton (FY22 working capital) | US | 7 | working_capital_stress | EARNINGS_CALL | A |
| SRC-107 | Blockbuster (CNBC corrob.) | US | 14 | demand_generation_failure | JOURNALISM | B |
| SRC-108 | Tropicana (Ad Age corrob.) | US | 10 | gtm_channel_mismatch | JOURNALISM | B |

## 4. NOTES
- Corroboration: SRC-030 (Blockbuster) and SRC-066 (Tropicana) now each have a second
  independent source (SRC-107, SRC-108) → upgrade-eligible from C to B at the
  verification slice.
- New geographies: South Africa/Germany (Steinhoff), China (Evergrande),
  Australia/NZ (Dick Smith), plus UK depth — but the pool is still US-heavy overall.
- New source type used: EARNINGS_CALL (Walmart, Peloton).
- Stable-healthy now grounded by both company filings (Costco, Nucor) and population
  base-rate datasets (ONS, Census BFS) — the abstention/no-intervention end.

## 5. NEXT STEP
See refreshed `ROUND_2_SOURCE_COVERAGE_GAP_AUDIT.md`. Remaining before authoring:
GOOD still < 30 and AMBIGUOUS still < 20 vs final-corpus floors; large-cap still
> 25%; thin diagnosis buckets pricing_power (2), margin_erosion (3),
customer_retention_erosion (4); still US-heavy. A slice 4 (optional) can top these up,
but the **full-text verification slice** is the gating prerequisite before any record
becomes a `source.json`-backed benchmark case. **Stage A remains DO_NOT_PROMOTE /
BLOCKED.**
