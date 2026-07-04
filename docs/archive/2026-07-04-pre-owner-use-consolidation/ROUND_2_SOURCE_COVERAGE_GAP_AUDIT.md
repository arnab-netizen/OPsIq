# ROUND 2 — SOURCE COVERAGE GAP AUDIT (slices 1 + 2 + 3)

**Mode:** audit only — no benchmark cases, no scorer, no engine/gate/answer-key change.
**Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Compares the **108 candidate source records** (slice_1 SRC-001..036 + slice_2
SRC-037..072 + slice_3 SRC-073..108) against every coverage dimension. Machine index:
`_COMBINED_INDEX.json`. (Supersedes the slice-1+2 version of this audit.)

---

## 1. DIAGNOSIS BUCKET COVERAGE — ✅ 15/15
All 15 owner-mode buckets represented. **Thin buckets (≤4 candidates), top up before
authoring 6 cases/bucket:** `pricing_power` (2), `margin_erosion` (3),
`customer_retention_erosion` (4).

## 2. OUTCOME CATEGORY COVERAGE — ✅ 20/20
Every category 1–20 has ≥1 candidate. Distribution still skewed (see §6).

## 3. SOURCE CATEGORY DIVERSITY — 7 types, better balanced
| Source type | Count |
|---|---|
| JOURNALISM | 43 |
| SEC_FILING | 42 |
| GOVERNMENT_REPORT | 12 |
| PUBLIC_DATASET | 6 |
| BANKRUPTCY_RESTRUCTURING | 2 |
| EARNINGS_CALL | 2 |
| FOUNDER_POSTMORTEM | 1 |
SEC filings now ≈ journalism. **Still thin:** founder postmortems (1) and primary
bankruptcy/restructuring dockets (2) — collect more if a slice 4 runs.

## 4. COMPANY-SIZE / BUSINESS-TYPE DIVERSITY — ⚠ improved, still large-cap-heavy
Size mix (108): large-cap 41, dataset/population 39, mid-market 11, small 10,
startup 4, franchise 3. Excluding the 39 population datasets, large-cap is **41/69
(59%)** of company-level records — **still over the ≤25% rule.** Slice 3 added
genuine small/mid/private/non-US cases (BHS, Patisserie Valerie, Dick Smith, KFC-UK
franchise, World Bank/SBA SME), but large public companies remain over-represented.
**Still the top business-mix gap.**

## 5. GEOGRAPHY DIVERSITY — ⚠ improved, still US-heavy
Non-US now includes UK (Carillion, BHS, Thomas Cook, Patisserie Valerie, KFC-UK,
Ratners), South Africa/Germany (Steinhoff), China (Evergrande), Australia/NZ (Dick
Smith), Finland (Nokia), Canada (BlackBerry), plus multi-country datasets (World Bank,
OECD). Still predominantly US. Add more non-Western / emerging-market cases in slice 4.

## 6. GOOD / BAD / MIXED / AMBIGUOUS MIX — ⚠ improved, GOOD & AMBIGUOUS still short
| Valence | Pool (of 108) | Final-corpus floor (of 150) | Standing |
|---|---|---|---|
| GOOD (4,11,12,13) | **23 (21%)** | ≥ 30 | short by ~7 |
| BAD (1,2,10,14,15,16,17,18,19) | **47 (44%)** | ≥ 45 | ✅ already meets floor — **stop adding BAD** |
| MIXED (3,5,6,7,8,9) | **30 (28%)** | ≥ 25 | ✅ meets |
| AMBIGUOUS (20) | **8 (7%)** | ≥ 20 | short by ~12 |
GOOD nearly doubled (11→23) and AMBIGUOUS doubled (4→8) this slice, but both remain
the **priority for any slice 4**: more verified GOOD/stable-healthy and more genuine
abstention/insufficient-evidence sources. BAD is now saturated relative to the floor.

## 7. REAL vs SYNTHETIC QUOTA
108 **real** candidate records; **0 synthetic**. Comfortably on track for the ≥60%
real-source target *conditional on full-text verification* (§9). Synthetic (≤60,
≤20 pure) added later only for abstention/edge/adversarial controls, labeled.

## 8. RELIABILITY DISTRIBUTION
A=49, B=56, C=3. The 3 C-rated: SRC-030 Blockbuster and SRC-066 Tropicana **now each
have a corroborating record** (SRC-107, SRC-108) → upgrade-eligible to B at
verification. SRC-103 Schlitz remains uncorroborated C → needs a second source.

## 9. FULL-TEXT VERIFICATION STATUS — ❌ 0 verified (environment blocker, persistent)
- **FULL_TEXT_VERIFIED: 0.**
- **SEARCH_SNIPPET_ONLY: 108** (72 explicit slice-2/3 + 36 slice-1 equivalent).
- **SECONDARY_ONLY / NEEDS_RECHECK: 0 explicit**, but **all 108 require recheck.**
Root cause: `WebFetch` returns HTTP 403 for all primary domains in this sandbox.
**HARD RULE HONORED: 0 records promoted to REAL_SOURCE_BACKED.** A dedicated full-text
verification slice (working fetch or manual review) must confirm each metric against a
page/section/row locator before any record backs a benchmark case.

## 10. PRIORITIZED GAPS (for slice 4 and/or verification slice)
1. **Full-text verification of all 108** — the gating prerequisite (no promotion until done).
2. **GOOD-outcome (+7) and AMBIGUOUS/abstention (+12)** to clear the final-corpus floors.
3. **Reduce large-cap share** — more small-business / private / non-US (≤25% rule).
4. **Thin diagnosis buckets:** pricing_power, margin_erosion, customer_retention_erosion.
5. **More founder postmortems + primary bankruptcy dockets;** corroborate SRC-103 (Schlitz).
6. **Stop adding BAD-outcome cases** (already at floor).

## 11. STANDING SUMMARY
| Dimension | Status |
|---|---|
| Diagnosis buckets (15) | ✅ 15/15 (3 thin) |
| Outcome categories (20) | ✅ 20/20 |
| Source categories | ✅ 7 types (founder/bankruptcy thin) |
| Company size | ⚠ large-cap 59% of company records (>25%) |
| Geography | ⚠ US-heavy (non-US improved) |
| Valence mix | ⚠ GOOD 23/≥30, AMBIG 8/≥20 short; BAD/MIXED met |
| Real vs synthetic | ✅ 108 real / 0 synthetic |
| Reliability | ⚠ A49/B56/C3 (2 C corroborated, 1 pending) |
| Full-text verification | ❌ 0/108 (all need recheck) |
| REAL_SOURCE_BACKED promoted | ✅ 0 (hard rule honored) |

**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
