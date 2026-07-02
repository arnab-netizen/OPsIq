# OpsIQ Business-Reality Module / Domain Coverage Matrix

> Updated after each corpus pack. Maps the cumulative counted corpus against the 30 OpsIQ modules/domains. DB /
> desktop / mobile proof is per-pack (each pack proves ALL its scenarios through DB + desktop + mobile in CI).
> "Live outcome" is intentionally out of scope until a live pilot; this corpus proves handling/safety, not live profit.

## Cumulative corpus on main (after Growth/Profit/Scaling Pack)
| Pack | Count | DB | Desktop | Mobile | Status |
|---|---|---|---|---|---|
| Chaos baseline (v1) | 180 | 180/180 | 180 (repr.) | repr. | merged |
| Unknown / OOD | 110 | 110/110 | 110 | 110 | merged (#66) |
| Staff / Proof / Anti-Gaming | 120 | 120/120 | 120 | 120 | merged (#67) |
| Daily Operations | 300 | 300/300 | 300 | 300 | merged (#68) |
| Finance / Cash / Capital Allocation | 120 | 120/120 | 120 | 120 | merged (#69) |
| Weekly Management / Trend | 150 | 150/150 | 150 | 150 | merged (#70) |
| **Growth / Profit / Scaling** | **150** | **150/150** | **150 (CI)** | **150 (CI)** | **this pack** |
| **Cumulative counted** | **1130** | | | | |
| Sequential simulations | 0 | — | — | — | pending (Step 7) |

Action-status coverage across the corpus: all five statuses (proceed / cautious_proceed / need_more_data /
owner_decision_required / blocked) present in every pack. Corpus-wide policy-violation / high-risk-proceed /
critical-missing-proceed / live-claim counts: **0**.

## Module / domain coverage (30 modules)
Legend: cumulative scenarios primarily exercising the module · this-pack contribution · proof (DB/desktop/mobile
all = the owning packs' full proof) · action-status coverage · high-risk coverage · gap.

| # | Module / domain | Cumulative | Growth pack | Proof | Action-status | High-risk | Gap |
|---|---|---|---|---|---|---|---|
| 1 | Owner command center | 1130 | 150 | full | all 5 | yes | none (every scenario renders here) |
| 2 | AI supervisor summary | 1130 | 150 | full | all 5 | yes | none |
| 3 | Action-status policy | 1130 | 150 | full | all 5 | yes | none |
| 4 | Input quality / data sufficiency | 1130 | 150 | full | all 5 | yes | none |
| 5 | Confidence / uncertainty | 1130 | 150 | full | all 5 | yes | none |
| 6 | Missing data / next-best request | ~515 | 40 | full | need_more_data | n/a | none |
| 7 | Proof / evidence ledger | 1130 | 150 | full | all 5 | yes | none |
| 8 | Reassessment loop | 1130 | 150 | full | all 5 | yes | none |
| 9 | Expected-vs-actual outcome loop | 180 | 0 (expected-impact separated) | DB | n/a | n/a | **sequential-sims pending (Step 7)** |
| 10 | Learning / adjudication governance | 180+ | 0 (no promotion) | suite | n/a | n/a | governance green; no promotion in packs |
| 11 | Source / privacy guard | 1130 | 150 (24 src) | suite+DB | n/a | n/a | none |
| 12 | Business-scope isolation | 1130 | 150 | DB | n/a | n/a | none |
| 13 | Dashboard desktop | 1130 | 150 | desktop | all 5 | yes | none |
| 14 | Dashboard mobile | 1130 | 150 | mobile | all 5 | yes | none |
| 15 | Owner / delegate split | 1130 | 150 | full | all 5 | yes | none |
| 16 | Owner workload reduction | 1130 | 150 | full | all 5 | yes | none |
| 17 | Staff execution | 450 | 15 (hiring/team scaling) | full | all 5 | yes | none (Staff/Proof + Daily Ops + Weekly + Growth) |
| 18 | Staff training / SOP drift | 130 | 0 | full | mixed | yes | none |
| 19 | Anti-gaming / proof fraud | 147 | 2 (gamed growth numbers) | full | blocked | yes | none |
| 20 | Finance / cash / capital allocation | ~150 | ~30 (branch/geo cash-drain, capex) | full | all 5 | yes | none |
| 21 | Revenue / margin / profit | ~200 | ~63 (new-line/price/margin/bulk/marketing) | full | all 5 | yes | full (Finance + Weekly + Growth) |
| 22 | Customer experience | ~85 | 0 | full | all 5 | mixed | extended by Customer/Vendor pack (Step 4) |
| 23 | Vendor / supply chain | ~50 | 15 (bulk contract terms) | full | all 5 | mixed | extended by Customer/Vendor pack (Step 4) |
| 24 | Market / competition | ~60 | 30 (geo + marketing scale-up) | full | mixed | mixed | extended by Customer/Vendor pack (Step 4) |
| 25 | Growth / scaling | **150** | **150** | full | all 5 | yes | **none (this pack)** |
| 26 | Local / legal / professional boundary | ~51 | 11 (expansion/labour/consumer/franchise) | full | blocked/owner | yes | extended by Local/Legal pack (Step 5) |
| 27 | Compliance / safety | ~80 | 11 (expansion compliance) | full | blocked | yes | extended by Local/Legal + Crisis packs |
| 28 | Crisis / tail-risk | ~30 | 0 | DB | mixed | yes | **Crisis pack (Step 6)** |
| 29 | Unknown / OOD handling | 110 | 0 | full | all 5 | yes | none |
| 30 | Shadow-pilot / owner-unavailable | shadow-pilot suite | 0 | suite | n/a | n/a | extended by Sequential-sims (Step 7) |
| 31 | Weekly management / trend detection | 150 | 0 | full | all 5 | yes | none |

## Notes on remaining gaps (addressed by later chain steps)
- **Expected-vs-actual outcome loop (9)** and **shadow-pilot/owner-unavailable (30)**: extended by the Sequential
  Simulations pack (Step 7), which proves multi-event time evolution + outcome loops.
- **Market/competition (24), Growth/scaling (25), Crisis/tail-risk (28)**: the current cumulative coverage is
  incidental; the dedicated Growth (Step 3), Customer/Vendor/Market (Step 4), and Ugly/Tail-Risk/Crisis (Step 6)
  packs bring each to full coverage.
- No module owned by the current (Growth/Profit/Scaling) pack is left untested: growth / scaling (25) is fully
  covered by this pack's 150 DB + desktop + mobile (CI) proven scenarios, which also bring revenue/margin/profit
  (21) to full coverage and extend finance (20), vendor/contract (23), market/competition (24), local/legal
  boundary (26), and compliance (27).
