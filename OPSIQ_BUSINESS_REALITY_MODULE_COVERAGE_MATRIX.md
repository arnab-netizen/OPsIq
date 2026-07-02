# OpsIQ Business-Reality Module / Domain Coverage Matrix

> Updated after each corpus pack. Maps the cumulative counted corpus against the 30 OpsIQ modules/domains. DB /
> desktop / mobile proof is per-pack (each pack proves ALL its scenarios through DB + desktop + mobile in CI).
> "Live outcome" is intentionally out of scope until a live pilot; this corpus proves handling/safety, not live profit.

## Cumulative corpus on main (after Finance/Cash Pack)
| Pack | Count | DB | Desktop | Mobile | Status |
|---|---|---|---|---|---|
| Chaos baseline (v1) | 180 | 180/180 | 180 (repr.) | repr. | merged |
| Unknown / OOD | 110 | 110/110 | 110 | 110 | merged (#66) |
| Staff / Proof / Anti-Gaming | 120 | 120/120 | 120 | 120 | merged (#67) |
| Daily Operations | 300 | 300/300 | 300 | 300 | merged (#68) |
| **Finance / Cash / Capital Allocation** | **120** | **120/120** | **120 (CI)** | **120 (CI)** | **this pack** |
| **Cumulative counted** | **830** | | | | |
| Sequential simulations | 0 | — | — | — | pending (Step 7) |

Action-status coverage across the corpus: all five statuses (proceed / cautious_proceed / need_more_data /
owner_decision_required / blocked) present in every pack. Corpus-wide policy-violation / high-risk-proceed /
critical-missing-proceed / live-claim counts: **0**.

## Module / domain coverage (30 modules)
Legend: cumulative scenarios primarily exercising the module · this-pack contribution · proof (DB/desktop/mobile
all = the owning packs' full proof) · action-status coverage · high-risk coverage · gap.

| # | Module / domain | Cumulative | Finance pack | Proof | Action-status | High-risk | Gap |
|---|---|---|---|---|---|---|---|
| 1 | Owner command center | 830 | 120 | full | all 5 | yes | none (every scenario renders here) |
| 2 | AI supervisor summary | 830 | 120 | full | all 5 | yes | none |
| 3 | Action-status policy | 830 | 120 | full | all 5 | yes | none |
| 4 | Input quality / data sufficiency | 830 | 120 | full | all 5 | yes | none |
| 5 | Confidence / uncertainty | 830 | 120 | full | all 5 | yes | none |
| 6 | Missing data / next-best request | ~430 | 34 | full | need_more_data | n/a | none |
| 7 | Proof / evidence ledger | 830 | 120 | full | all 5 | yes | none |
| 8 | Reassessment loop | 830 | 120 | full | all 5 | yes | none |
| 9 | Expected-vs-actual outcome loop | 180 | 0 (expected-impact separated) | DB | n/a | n/a | **sequential-sims pending (Step 7)** |
| 10 | Learning / adjudication governance | 180+ | 0 (no promotion) | suite | n/a | n/a | governance green; no promotion in packs |
| 11 | Source / privacy guard | 830 | 120 (24 src) | suite+DB | n/a | n/a | none |
| 12 | Business-scope isolation | 830 | 120 | DB | n/a | n/a | none |
| 13 | Dashboard desktop | 830 | 120 | desktop | all 5 | yes | none |
| 14 | Dashboard mobile | 830 | 120 | mobile | all 5 | yes | none |
| 15 | Owner / delegate split | 830 | 120 | full | all 5 | yes | none |
| 16 | Owner workload reduction | 830 | 120 | full | all 5 | yes | none |
| 17 | Staff execution | 420 | 0 | full | all 5 | yes | none (Staff/Proof + Daily Ops) |
| 18 | Staff training / SOP drift | 130 | 0 | full | mixed | yes | none |
| 19 | Anti-gaming / proof fraud | 140 | 3 (financial fraud) | full | blocked | yes | none |
| 20 | Finance / cash / capital allocation | **120** | **120** | full | all 5 | yes | **none (this pack)** |
| 21 | Revenue / margin / profit | ~90 | ~40 (margin/pricing/discount) | full | all 5 | yes | extended by Growth pack (Step 3) |
| 22 | Customer experience | ~55 | 0 | full | all 5 | mixed | extended by Customer/Vendor pack (Step 4) |
| 23 | Vendor / supply chain | ~35 | 10 (vendor payment) | full | all 5 | mixed | extended by Customer/Vendor pack (Step 4) |
| 24 | Market / competition | ~15 | 0 | DB | mixed | mixed | **Customer/Vendor pack (Step 4)** |
| 25 | Growth / scaling | ~15 | 0 | DB | mixed | mixed | **Growth pack (Step 3)** |
| 26 | Local / legal / professional boundary | ~40 | 10 (tax/financing) | full | blocked/owner | yes | extended by Local/Legal pack (Step 5) |
| 27 | Compliance / safety | ~60 | 17 (finance compliance) | full | blocked | yes | extended by Local/Legal + Crisis packs |
| 28 | Crisis / tail-risk | ~30 | 0 | DB | mixed | yes | **Crisis pack (Step 6)** |
| 29 | Unknown / OOD handling | 110 | 0 | full | all 5 | yes | none |
| 30 | Shadow-pilot / owner-unavailable | shadow-pilot suite | 0 | suite | n/a | n/a | extended by Sequential-sims (Step 7) |

## Notes on remaining gaps (addressed by later chain steps)
- **Expected-vs-actual outcome loop (9)** and **shadow-pilot/owner-unavailable (30)**: extended by the Sequential
  Simulations pack (Step 7), which proves multi-event time evolution + outcome loops.
- **Market/competition (24), Growth/scaling (25), Crisis/tail-risk (28)**: the current cumulative coverage is
  incidental; the dedicated Growth (Step 3), Customer/Vendor/Market (Step 4), and Ugly/Tail-Risk/Crisis (Step 6)
  packs bring each to full coverage.
- No module owned by the current (Finance) pack is left untested: finance/cash/capital-allocation (20) is fully
  covered by this pack's 120 DB + desktop + mobile proven scenarios.
