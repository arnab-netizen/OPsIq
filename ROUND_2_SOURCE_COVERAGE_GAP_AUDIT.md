# ROUND 2 — SOURCE COVERAGE GAP AUDIT (slice 1 + slice 2)

**Mode:** audit only — no benchmark cases, no scorer, no engine/gate/answer-key change.
**Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Compares the **72 candidate source records** (slice_1 SRC-001..036 + slice_2
SRC-037..072) against every coverage dimension in
`ROUND_2_REAL_WORLD_SOURCE_STANDARD.md`, `ROUND_2_REAL_CASE_SOURCING_PLAN.md`, and
`ROUND_2_OUTCOME_SPECTRUM_REQUIREMENTS.md`. Machine index: `_COMBINED_INDEX.json`.

---

## 1. DIAGNOSIS BUCKET COVERAGE — ✅ 15/15
All 15 owner-mode buckets are represented across the candidate pool
(cash_liquidity, unit_economics, margin_erosion, pricing_power, demand_generation,
gtm_channel_mismatch, customer_retention, quality_trust, operational_bottleneck,
inventory_forecasting, working_capital, debt_solvency, legal_governance,
key_person_risk, strategic_capex). **No diagnosis gaps remain.** Thin buckets
(≤2 candidates): inventory_forecasting, working_capital, operational_bottleneck —
top up before authoring 6 cases/bucket.

## 2. OUTCOME CATEGORY COVERAGE — ✅ 20/20
Every outcome category 1–20 has ≥1 candidate. **No outcome gaps remain.** But the
*distribution* is skewed (see §6): outcomes 7 (high-rev-cash-crisis, 3) and 10
(wrong-action-worsened, 4) are thin and must be topped up; 12 (stable-healthy) has
only 2 (Costco, BLS prior).

## 3. SOURCE CATEGORY DIVERSITY — 6 types, but over-weighted to journalism
| Source type | Count |
|---|---|
| JOURNALISM | 33 |
| SEC_FILING | 28 |
| GOVERNMENT_REPORT | 6 |
| PUBLIC_DATASET | 3 |
| FOUNDER_POSTMORTEM | 1 |
| BANKRUPTCY_RESTRUCTURING | 1 |
**Gap:** journalism (46%) exceeds primary filings; bankruptcy/restructuring dockets
(1) and founder postmortems (1) are under-collected vs their value. Slice 3 should add
primary bankruptcy filings and first-party postmortems.

## 4. COMPANY-SIZE / BUSINESS-TYPE DIVERSITY — ❌ large-cap over-represented
Slice-2 size mix: large-cap 19, mid-market 7, small 4, startup 3, franchise 2.
Combined pool is **dominated by large public companies** (most recognizable cases are
large-cap). This **violates the ≤25% large-cap rule** in the outcome-spectrum doc.
**Largest remaining gap.** Business *types* are diverse (retail, restaurant/QSR,
franchise, manufacturing, SaaS, DTC, ecommerce, marketplace, fintech, healthcare,
hospitality, airline, auto, micromobility, CPG, dataset) but skew large/public.
**Action:** slice 3 must source genuine small-business / owner-operated / private
mid-market cases (franchise FDDs, SBA/【SBDC】case reports, local-business journalism,
court filings for private firms).

## 5. GEOGRAPHY DIVERSITY — ❌ US-heavy
Predominantly US. Non-US present: UK (Ratners), Finland (Nokia), Canada (BlackBerry),
Germany (Wirecard), China (Luckin), Denmark (LEGO). **Gap:** little coverage of
non-Western / emerging-market / small-economy businesses. Slice 3 should add non-US
small/mid-market sources where credible.

## 6. GOOD / BAD / MIXED / AMBIGUOUS MIX — ❌ BAD-heavy, GOOD & AMBIGUOUS light
| Valence | Candidate pool (of 72) | Final-corpus floor (of 150) |
|---|---|---|
| GOOD (4,11,12,13) | **11 (15%)** | ≥ 30 (20%) |
| BAD (1,2,10,14,15,16,17,18,19) | **36 (50%)** | ≥ 45 (30%) |
| MIXED (3,5,6,7,8,9) | **21 (29%)** | ≥ 25 |
| AMBIGUOUS (20) | **4 (6%)** | ≥ 20 |
**Gap:** the pool is failure-biased (the documented-source world over-represents
failures). GOOD and AMBIGUOUS/abstention are the **priority for slice 3** so the final
corpus is not skewed toward distress (the exact survivorship-inversion the
outcome-spectrum doc warns about).

## 7. REAL vs SYNTHETIC QUOTA
72 **real** candidate records; **0 synthetic**. On track for the ≥60% real-source
target — *conditional on full-text verification* (§9). Synthetic (≤60, ≤20 pure) will
be added later only for abstention/edge/adversarial controls, explicitly labeled.

## 8. RELIABILITY DISTRIBUTION
A=28, B=42, C=2. C-rated (SRC-030 Blockbuster, SRC-066 Tropicana) need a corroborating
primary before use (standard §4: C only with corroboration).

## 9. FULL-TEXT VERIFICATION STATUS — ❌ 0 verified (environment blocker)
- **FULL_TEXT_VERIFIED: 0.**
- **SEARCH_SNIPPET_ONLY: 72** (36 slice-2 explicit + 36 slice-1 equivalently
  snippet-verified; the field was introduced in slice 2).
- **SECONDARY_ONLY: 0 · NEEDS_RECHECK: 0** (but effectively **all 72 require recheck**
  before promotion).
Root cause: `WebFetch` returns HTTP 403 for all primary domains in this sandbox, so
figures rest on `WebSearch` snippets, not full-text reads.
**HARD RULE HONORED: 0 records promoted to REAL_SOURCE_BACKED.** A dedicated
full-text verification slice (working fetch, or manual review) must confirm each
`source_backed_metrics` figure against a page/section/row locator before any record
backs a benchmark case.

## 10. PRIORITIZED GAP LIST FOR SLICE 3
1. **GOOD-outcome + stable-healthy + AMBIGUOUS/abstention** sources (biggest skew).
2. **Small-business / private / non-US** cases (≤25% large-cap rule; geography).
3. **Top up outcomes 7 and 10**, and thin diagnosis buckets (inventory, working-capital,
   operational_bottleneck).
4. **More primary filings, bankruptcy dockets, founder postmortems**; corroborate the
   2 C-rated records.
5. **Full-text verification slice** for all 72 before any REAL_SOURCE_BACKED promotion.

## 11. STANDING SUMMARY
| Dimension | Status |
|---|---|
| Diagnosis buckets (15) | ✅ 15/15 |
| Outcome categories (20) | ✅ 20/20 (distribution skewed) |
| Source categories | ⚠ 6 types, journalism-heavy |
| Company size | ❌ large-cap-heavy (>25%) |
| Geography | ❌ US-heavy |
| Valence mix | ❌ BAD-heavy; GOOD/AMBIGUOUS light |
| Real vs synthetic | ✅ 72 real / 0 synthetic |
| Reliability | ⚠ A28/B42/C2 (2 need corroboration) |
| Full-text verification | ❌ 0/72 (all require recheck) |
| REAL_SOURCE_BACKED promoted | ✅ 0 (hard rule honored) |

**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
