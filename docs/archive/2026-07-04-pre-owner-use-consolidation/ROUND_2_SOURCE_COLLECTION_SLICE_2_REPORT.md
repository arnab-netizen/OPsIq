# ROUND 2 — SOURCE COLLECTION SLICE 2 REPORT

**Mode:** source-record collection only — **no benchmark cases authored**, no scorer,
no engine/gate/answer-key change. **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Gap-closure pass over slice 1. Produces **candidate source records** (provenance
only) under `simulation_runs/round_002_source_candidates/slice_2/` (SRC-037…SRC-072).

---

## 0. RESULT
**36 new candidate records** (target ≥ 30), all valid JSON with the full extended
schema present (incl. `company_size_stage`, `geography`, `time_period`,
`macro_context`, `owner_decision_context`, `action_taken`, `verification_status`,
`source_leakage_risk`). **Combined total: 72 records** (slice 1 + slice 2).

## 1. GAP-CLOSURE TARGETS (slice 2)
| Required (≥5 each) | Achieved |
|---|---|
| GTM/channel-mismatch candidates | **7** (SRC-037,038,039,040,041,044,066) |
| Key-person/team-capability candidates | **9** (SRC-046–054) |
| Severe-distress-but-survival (outcome 3, +13 shock-recovery) | **3 (+2 = 5)** |
| Partial-recovery/mixed (outcome 5) | **6** |
| High-revenue-cash-crisis (outcome 7) | **3 (+1 outcome-8 Bird)** — slightly short of 5* |
| Wrong-action-worsened (outcome 10) | **4** (Wells Fargo recoded to 15) — slightly short of 5* |
| Founder/key-person/team failure (outcome 16) | **8** |
| Small-business/mid-market/franchise/private | **~16** (franchise 2, mid-market 7, small 4, startup 3) |

\* Outcomes 7 and 10 landed at 3–4 strict matches because the strongest verifiable
cases overlapped adjacent categories (Bird → outcome 8; Wells Fargo → outcome 15).
Flagged for top-up in slice 3 (see gap audit §4).

## 2. ⚠ VERIFICATION STATUS (binding)
`WebFetch` returned **HTTP 403 for every primary domain** again this slice (sec.gov,
gov, IR/PR pages). Every figure was confirmed against `WebSearch` snippets from the
cited primary/credible domain — **0 records are FULL_TEXT_VERIFIED**. All 36 slice-2
records are honestly marked `verification_status: SEARCH_SNIPPET_ONLY`; the 36 slice-1
records are equivalently snippet-verified (that field was added in slice 2). **No
record may be promoted to REAL_SOURCE_BACKED until a full-text verification slice
re-checks each metric against a source locator** (hard rule honored: 0 promoted).

## 3. SLICE-2 RECORD INDEX
| ID | Company | Size/stage | Outcome | Diagnosis | Source | Rel |
|---|---|---|---|---|---|---|
| SRC-037 | Blue Apron | large-cap | 6 | gtm_channel_mismatch | SEC_FILING | A |
| SRC-038 | Wish (ContextLogic) | large-cap | 14 | gtm_channel_mismatch | SEC_FILING | A |
| SRC-039 | Stitch Fix | large-cap | 5 | gtm_channel_mismatch | SEC_FILING | B |
| SRC-040 | Bed Bath & Beyond | large-cap | 1 | gtm_channel_mismatch | SEC_FILING | B |
| SRC-041 | The Honest Company | large-cap | 6 | gtm_channel_mismatch | SEC_FILING | A |
| SRC-042 | Quiznos | franchise | 2 | debt_solvency_pressure | JOURNALISM | B |
| SRC-043 | Cosi | mid-market | 2 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-044 | Subway | franchise | 5 | gtm_channel_mismatch | JOURNALISM | B |
| SRC-045 | GAO SBA franchise 7(a) loans | small business | 20 | debt_solvency_pressure | GOVERNMENT_REPORT | A |
| SRC-046 | Market Basket (Demoulas) | mid-market/family | 16→3 | key_person_risk | JOURNALISM | B |
| SRC-047 | Uber (Kalanick) | late-stage startup | 16→3 | key_person_risk | JOURNALISM | B |
| SRC-048 | American Apparel (Charney) | mid-cap | 16/2 | key_person_risk | JOURNALISM | B |
| SRC-049 | Zenefits (Conrad) | startup | 16→3 | key_person_risk | JOURNALISM | B |
| SRC-050 | Papa John's (Schnatter) | mid-large public | 16→3 | key_person_risk | JOURNALISM | B |
| SRC-051 | Away (Korey) | startup | 16→5 | key_person_risk | JOURNALISM | B |
| SRC-052 | Groupon (Mason) | post-IPO | 16→9 | key_person_risk | JOURNALISM | B |
| SRC-053 | Ratners Group (Ratner) | large public | 16/10 | key_person_risk | JOURNALISM | B |
| SRC-054 | SMB owner-dependency survey | SMB population | 20 | key_person_risk | PUBLIC_DATASET | B |
| SRC-055 | Ford (2006-09) | large-cap | 3 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-056 | Marriott (2020) | large-cap | 13 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-057 | Carnival (2020) | large-cap | 3 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-058 | AMC (2020-21) | mid/large-cap | 3 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-059 | Carvana (2022-23) | mid/large-cap | 7 | debt_solvency_pressure | SEC_FILING | A |
| SRC-060 | Tesla (2017-18) | large-cap | 7 | operational_bottleneck | SEC_FILING | B |
| SRC-061 | Bird Global | small/mid-cap | 8 | cash_liquidity_crisis | BANKRUPTCY_RESTRUCTURING | B |
| SRC-062 | Delta Air Lines (2020) | large-cap | 13 | cash_liquidity_crisis | SEC_FILING | A |
| SRC-063 | Beyond Meat | mid/small-cap | 7 | margin_erosion | SEC_FILING | B |
| SRC-064 | J.C. Penney (Ron Johnson) | large-cap | 10 | pricing_power | SEC_FILING | A |
| SRC-065 | Coca-Cola (New Coke) | large-cap | 10 | quality_trust_failure | JOURNALISM | B |
| SRC-066 | Tropicana (PepsiCo) | large-cap | 10 | gtm_channel_mismatch | JOURNALISM | C |
| SRC-067 | Wells Fargo | large-cap | 15 | legal_governance_risk | GOVERNMENT_REPORT | A |
| SRC-068 | Gap Inc. | large-cap | 5 | strategic_capex_risk | JOURNALISM | B |
| SRC-069 | Nokia | large-cap | 5 | strategic_capex_risk | JOURNALISM | B |
| SRC-070 | BlackBerry/RIM | mid-cap | 5 | strategic_capex_risk | JOURNALISM | B |
| SRC-071 | General Electric | large-cap | 5 | debt_solvency_pressure | JOURNALISM | B |
| SRC-072 | Eastman Kodak | large-cap | 10 | strategic_capex_risk | JOURNALISM | B |

## 4. NOTES
- Outcome-16 records carry a documented *resolution* arc (16→3 survival, 16→2
  bankruptcy, 16→9 correction), valuable for the scorer's action-direction check.
- `source_leakage_risk: HIGH` on essentially all named cases (identity/outcome leaks
  the answer) → identity must be de-identified in any future engine-visible input.
- C-rated records now total 2 (SRC-030 Blockbuster, SRC-066 Tropicana) — both need a
  corroborating primary before use.
- New geographies added: UK (Ratners), Finland (Nokia), Canada (BlackBerry).

## 5. NEXT STEP
See `ROUND_2_SOURCE_COVERAGE_GAP_AUDIT.md` for the combined-corpus standing. Slice 3:
prioritize GOOD-outcome and stable-healthy/abstention sources, more genuine
small-business / non-US cases, and top up outcomes 7 and 10; then the **full-text
verification slice** before any record becomes a `source.json`-backed case.
**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
