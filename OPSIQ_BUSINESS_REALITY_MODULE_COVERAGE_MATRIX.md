# OpsIQ Business-Reality Module / Domain Coverage Matrix

> Updated after each corpus pack. Maps the cumulative counted corpus against the 30 OpsIQ modules/domains. DB /
> desktop / mobile proof is per-pack (each pack proves ALL its scenarios through DB + desktop + mobile in CI).
> "Live outcome" is intentionally out of scope until a live pilot; this corpus proves handling/safety, not live profit.

## Cumulative corpus on main (after Local/Legal/Professional-Boundary Pack)
| Pack | Count | DB | Desktop | Mobile | Status |
|---|---|---|---|---|---|
| Chaos baseline (v1) | 180 | 180/180 | 180 (repr.) | repr. | merged |
| Unknown / OOD | 110 | 110/110 | 110 | 110 | merged (#66) |
| Staff / Proof / Anti-Gaming | 120 | 120/120 | 120 | 120 | merged (#67) |
| Daily Operations | 300 | 300/300 | 300 | 300 | merged (#68) |
| Finance / Cash / Capital Allocation | 120 | 120/120 | 120 | 120 | merged (#69) |
| Weekly Management / Trend | 150 | 150/150 | 150 | 150 | merged (#70) |
| Growth / Profit / Scaling | 150 | 150/150 | 150 | 150 | merged (#71) |
| Customer / Vendor / Market | 100 | 100/100 | 100 | 100 | merged (#72) |
| **Local / Legal / Professional-Boundary** | **100** | **100/100** | **100 (CI)** | **100 (CI)** | **this pack** |
| **Cumulative counted** | **1330** | | | | |
| Sequential simulations | 0 | — | — | — | pending (Step 7) |

Action-status coverage across the corpus: all five statuses (proceed / cautious_proceed / need_more_data /
owner_decision_required / blocked) present in every pack. Corpus-wide policy-violation / high-risk-proceed /
critical-missing-proceed / live-claim counts: **0**.

## Module / domain coverage (30 modules)
Legend: cumulative scenarios primarily exercising the module · this-pack contribution · proof (DB/desktop/mobile
all = the owning packs' full proof) · action-status coverage · high-risk coverage · gap.

| # | Module / domain | Cumulative | LLB pack | Proof | Action-status | High-risk | Gap |
|---|---|---|---|---|---|---|---|
| 1 | Owner command center | 1330 | 100 | full | all 5 | yes | none (every scenario renders here) |
| 2 | AI supervisor summary | 1330 | 100 | full | all 5 | yes | none |
| 3 | Action-status policy | 1330 | 100 | full | all 5 | yes | none |
| 4 | Input quality / data sufficiency | 1330 | 100 | full | all 5 | yes | none |
| 5 | Confidence / uncertainty | 1330 | 100 | full | all 5 | yes | none |
| 6 | Missing data / next-best request | ~572 | 30 | full | need_more_data | n/a | none |
| 7 | Proof / evidence ledger | 1330 | 100 | full | all 5 | yes | none |
| 8 | Reassessment loop | 1330 | 100 | full | all 5 | yes | none |
| 9 | Expected-vs-actual outcome loop | 180 | 0 (expected-impact separated) | DB | n/a | n/a | **sequential-sims pending (Step 7)** |
| 10 | Learning / adjudication governance | 180+ | 0 (no promotion) | suite | n/a | n/a | governance green; no promotion in packs |
| 11 | Source / privacy guard | 1330 | 100 (24 src) | suite+DB | n/a | n/a | none |
| 12 | Business-scope isolation | 1330 | 100 | DB | n/a | n/a | none |
| 13 | Dashboard desktop | 1330 | 100 | desktop | all 5 | yes | none |
| 14 | Dashboard mobile | 1330 | 100 | mobile | all 5 | yes | none |
| 15 | Owner / delegate split | 1330 | 100 | full | all 5 | yes | none |
| 16 | Owner workload reduction | 1330 | 100 | full | all 5 | yes | none |
| 17 | Staff execution | 450 | 0 | full | all 5 | yes | none |
| 18 | Staff training / SOP drift | 130 | 0 | full | mixed | yes | none |
| 19 | Anti-gaming / proof fraud | 154 | 4 (fabricated tax docs / falsified books) | full | blocked | yes | none |
| 20 | Finance / cash / capital allocation | ~164 | 14 (tax provision / settlement / audit cost) | full | all 5 | yes | none |
| 21 | Revenue / margin / profit | ~230 | 0 | full | all 5 | yes | none |
| 22 | Customer experience | ~125 | 0 | full | all 5 | yes | none |
| 23 | Vendor / supply chain | ~90 | 0 | full | all 5 | yes | none |
| 24 | Market / competition | ~80 | 0 | full | all 5 | mixed | none |
| 25 | Growth / scaling | 150 | 0 | full | all 5 | yes | none |
| 26 | Local / legal / professional boundary | **156** | **100** | full | blocked/owner | yes | **none (this pack)** |
| 27 | Compliance / safety | ~130 | ~42 (tax/labour/licensing/regulatory/privacy/safety/IP/zoning) | full | blocked | yes | extended by Crisis pack (Step 6) |
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
- No module owned by the current (Local/Legal/Professional-Boundary) pack is left untested: local/legal/
  professional boundary (26) is now fully covered by this pack's 100 DB + desktop + mobile (CI) proven scenarios,
  which also substantially extend compliance/safety (27), anti-gaming (19), and finance (20). The pack proves OpsIQ
  PREPARES and routes legal/tax/HR/regulatory matters to a qualified professional — it never gives final advice.
- Remaining dedicated packs in the chain: Ugly/Tail-Risk/Crisis (Step 6 — module 28), Sequential Simulations
  (Step 7 — modules 9 + 30), Final Audit (Step 8).
