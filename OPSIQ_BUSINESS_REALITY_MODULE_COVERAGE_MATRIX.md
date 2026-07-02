# OpsIQ Business-Reality Module / Domain Coverage Matrix

> Updated after each corpus pack. Maps the cumulative counted corpus against the 30 OpsIQ modules/domains. DB /
> desktop / mobile proof is per-pack (each pack proves ALL its scenarios through DB + desktop + mobile in CI).
> "Live outcome" is intentionally out of scope until a live pilot; this corpus proves handling/safety, not live profit.

## Cumulative corpus on main (after Ugly/Tail-Risk/Crisis Pack)
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
| Local / Legal / Professional-Boundary | 100 | 100/100 | 100 | 100 | merged (#73) |
| **Ugly / Tail-Risk / Crisis** | **150** | **150/150** | **150 (CI)** | **150 (CI)** | **this pack** |
| **Cumulative counted** | **1480** | | | | |
| Sequential simulations | 0 | — | — | — | pending (Step 7) |

Action-status coverage across the corpus: all five statuses (proceed / cautious_proceed / need_more_data /
owner_decision_required / blocked) present in every pack. Corpus-wide policy-violation / high-risk-proceed /
critical-missing-proceed / live-claim counts: **0**.

## Module / domain coverage (30 modules)
Legend: cumulative scenarios primarily exercising the module · this-pack contribution · proof (DB/desktop/mobile
all = the owning packs' full proof) · action-status coverage · high-risk coverage · gap.

| # | Module / domain | Cumulative | UTR pack | Proof | Action-status | High-risk | Gap |
|---|---|---|---|---|---|---|---|
| 1 | Owner command center | 1480 | 150 | full | all 5 | yes | none (every scenario renders here) |
| 2 | AI supervisor summary | 1480 | 150 | full | all 5 | yes | none |
| 3 | Action-status policy | 1480 | 150 | full | all 5 | yes | none |
| 4 | Input quality / data sufficiency | 1480 | 150 | full | all 5 | yes | none |
| 5 | Confidence / uncertainty | 1480 | 150 | full | all 5 | yes | none |
| 6 | Missing data / next-best request | ~602 | 30 | full | need_more_data | n/a | none |
| 7 | Proof / evidence ledger | 1480 | 150 | full | all 5 | yes | none |
| 8 | Reassessment loop | 1480 | 150 | full | all 5 | yes | none |
| 9 | Expected-vs-actual outcome loop | 180 | 0 (expected-impact separated) | DB | n/a | n/a | **sequential-sims pending (Step 7)** |
| 10 | Learning / adjudication governance | 180+ | 0 (no promotion) | suite | n/a | n/a | governance green; no promotion in packs |
| 11 | Source / privacy guard | 1480 | 150 (24 src) | suite+DB | n/a | n/a | none |
| 12 | Business-scope isolation | 1480 | 150 | DB | n/a | n/a | none |
| 13 | Dashboard desktop | 1480 | 150 | desktop | all 5 | yes | none |
| 14 | Dashboard mobile | 1480 | 150 | mobile | all 5 | yes | none |
| 15 | Owner / delegate split | 1480 | 150 | full | all 5 | yes | none |
| 16 | Owner workload reduction | 1480 | 150 | full | all 5 | yes | none |
| 17 | Staff execution | 450 | 0 | full | all 5 | yes | none |
| 18 | Staff training / SOP drift | 130 | 0 | full | mixed | yes | none |
| 19 | Anti-gaming / proof fraud | 162 | 8 (fraud/theft/embezzlement/cover-up) | full | blocked | yes | none |
| 20 | Finance / cash / capital allocation | ~169 | 5 (cash-collapse triage) | full | all 5 | yes | none |
| 21 | Revenue / margin / profit | ~239 | 9 (revenue-shock recovery/lawsuit cost) | full | all 5 | yes | none |
| 22 | Customer experience | ~125 | 0 | full | all 5 | yes | none |
| 23 | Vendor / supply chain | ~98 | 8 (supply disruption) | full | all 5 | yes | none |
| 24 | Market / competition | ~80 | 0 | full | all 5 | mixed | none |
| 25 | Growth / scaling | 150 | 0 | full | all 5 | yes | none |
| 26 | Local / legal / professional boundary | ~206 | ~50 (crisis legal/safety boundaries) | full | blocked/owner | yes | none |
| 27 | Compliance / safety | ~180 | ~50 (safety/legal/insolvency/breach) | full | blocked | yes | full (Local/Legal + Crisis) |
| 28 | Crisis / tail-risk | **180** | **150** | full | all 5 | yes | **none (this pack)** |
| 29 | Unknown / OOD handling | 110 | 0 | full | all 5 | yes | none |
| 30 | Shadow-pilot / owner-unavailable | shadow-pilot suite | 0 | suite | n/a | n/a | extended by Sequential-sims (Step 7) |
| 31 | Weekly management / trend detection | 150 | 0 | full | all 5 | yes | none |

## Notes on remaining gaps (addressed by later chain steps)
- **Expected-vs-actual outcome loop (9)** and **shadow-pilot/owner-unavailable (30)**: extended by the Sequential
  Simulations pack (Step 7), which proves multi-event time evolution + outcome loops.
- **Market/competition (24), Growth/scaling (25), Crisis/tail-risk (28)**: the current cumulative coverage is
  incidental; the dedicated Growth (Step 3), Customer/Vendor/Market (Step 4), and Ugly/Tail-Risk/Crisis (Step 6)
  packs bring each to full coverage.
- No module owned by the current (Ugly/Tail-Risk/Crisis) pack is left untested: crisis/tail-risk (28) is now fully
  covered by this pack's 150 DB + desktop + mobile (CI) proven scenarios, which also bring compliance/safety (27)
  to full coverage and extend anti-gaming (19), finance/cash-survival (20), and legal boundary (26). The pack
  proves OpsIQ handles crises with restraint — it blocks unsafe/irreversible moves and never claims to autonomously
  handle a high-risk crisis.
- Remaining dedicated steps in the chain: Sequential Simulations (Step 7 — modules 9 + 30, multi-event time
  evolution + outcome loops), Final Business Reality Corpus Audit (Step 8).
