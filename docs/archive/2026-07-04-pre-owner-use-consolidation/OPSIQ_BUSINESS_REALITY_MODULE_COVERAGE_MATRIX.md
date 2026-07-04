# OpsIQ Business-Reality Module / Domain Coverage Matrix

> Updated after each corpus pack. Maps the cumulative counted corpus against the 30 OpsIQ modules/domains. DB /
> desktop / mobile proof is per-pack (each pack proves ALL its scenarios through DB + desktop + mobile in CI).
> "Live outcome" is intentionally out of scope until a live pilot; this corpus proves handling/safety, not live profit.

## Cumulative corpus on main (after Sequential Simulations Pack + Final Corpus Audit)
> Honest accounting (measured by the Final Corpus Audit, Step 8, directly from code): the chaos baseline is **165
> counted-for-readiness + 15 independent-gold = 180 replayed/proven**. So the true **counted-for-readiness** single
> scenarios = 1300 (business-reality) + 165 (chaos) = **1465**; adding the 15 chaos independent-gold gives **1480
> proven**. The "1480" figure below is the PROVEN total (counted + chaos gold), not the counted-for-readiness total.

| Pack | Count | DB | Desktop | Mobile | Status |
|---|---|---|---|---|---|
| Chaos baseline (v1) | 165 counted + 15 gold = 180 | 180/180 | 180 (repr.) | repr. | merged |
| Unknown / OOD | 110 | 110/110 | 110 | 110 | merged (#66) |
| Staff / Proof / Anti-Gaming | 120 | 120/120 | 120 | 120 | merged (#67) |
| Daily Operations | 300 | 300/300 | 300 | 300 | merged (#68) |
| Finance / Cash / Capital Allocation | 120 | 120/120 | 120 | 120 | merged (#69) |
| Weekly Management / Trend | 150 | 150/150 | 150 | 150 | merged (#70) |
| Growth / Profit / Scaling | 150 | 150/150 | 150 | 150 | merged (#71) |
| Customer / Vendor / Market | 100 | 100/100 | 100 | 100 | merged (#72) |
| Local / Legal / Professional-Boundary | 100 | 100/100 | 100 | 100 | merged (#73) |
| Ugly / Tail-Risk / Crisis | 150 | 150/150 | 150 (CI) | 150 (CI) | merged (#74) |
| **Cumulative single scenarios** | **1465 counted + 15 gold = 1480 proven** | 1480/1480 | per-pack | per-pack | audited (Step 8) |
| **Sequential simulations (multi-event)** | **50 sims / 427 events** | **50/50 sims, 427/427 events** | **≥20/shard (CI)** | **≥20/shard (CI)** | **this pack** |

Sequential simulations are counted SEPARATELY from the single scenarios (a different artifact shape: time-ordered
7–30-event sequences; 50 sims / 427 events). The single-scenario corpus is 1465 counted-for-readiness (1480 proven);
no schema change → all prior scenarios stay valid. The Final Corpus Audit (Step 8) verifies these totals, cross-pack
scenarioId uniqueness (1465 unique), source/privacy cleanliness (240 aggregated sources), and 0 unsafe / 0 live claims.

Action-status coverage across the corpus: all five statuses (proceed / cautious_proceed / need_more_data /
owner_decision_required / blocked) present in every pack. Corpus-wide policy-violation / high-risk-proceed /
critical-missing-proceed / live-claim counts: **0**.

## Module / domain coverage (30 modules)
Legend: cumulative scenarios primarily exercising the module · this-pack contribution · proof (DB/desktop/mobile
all = the owning packs' full proof) · action-status coverage · high-risk coverage · gap.
Note: "1480" in the Cumulative column denotes the PROVEN single-scenario total (1465 counted-for-readiness + 15 chaos
independent-gold), per the Step 8 Final Corpus Audit; the "UTR pack" column is the historical per-pack contribution.

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
| 9 | Expected-vs-actual outcome loop | 180 + 50 sims | 50 sims / 427 events | full (DB+desktop+mobile) | all 5 | yes | **none (Sequential-sims, this pack — expected-only)** |
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
| 30 | Shadow-pilot / owner-unavailable | shadow-pilot suite + 3 owner-away sims | 3 sims (owner HELD) | full (DB+desktop+mobile) | owner/blocked | yes | **none (Sequential-sims, this pack — decisions HOLD for owner)** |
| 31 | Weekly management / trend detection | 150 | 0 | full | all 5 | yes | none |

## Notes on remaining gaps (addressed by later chain steps)
- **Expected-vs-actual outcome loop (9)** and **shadow-pilot/owner-unavailable (30)**: brought to full coverage by the
  Sequential Simulations pack (Step 7) — 50 multi-event simulations (427 events) proving per-step decision correctness
  over time (all 50 sims / 427 events DB-backed through the REAL owner plan path). Expected-only: `liveDataBacked=false`
  on all 50; this proves DECISION correctness over time, NOT a live business outcome. The 3 owner_unavailable sims
  prove owner-gated decisions HOLD for the owner (nothing auto-proceeds).
- **Market/competition (24), Growth/scaling (25), Crisis/tail-risk (28)**: the current cumulative coverage is
  incidental; the dedicated Growth (Step 3), Customer/Vendor/Market (Step 4), and Ugly/Tail-Risk/Crisis (Step 6)
  packs bring each to full coverage.
- No module owned by the current (Ugly/Tail-Risk/Crisis) pack is left untested: crisis/tail-risk (28) is now fully
  covered by this pack's 150 DB + desktop + mobile (CI) proven scenarios, which also bring compliance/safety (27)
  to full coverage and extend anti-gaming (19), finance/cash-survival (20), and legal boundary (26). The pack
  proves OpsIQ handles crises with restraint — it blocks unsafe/irreversible moves and never claims to autonomously
  handle a high-risk crisis.
- Remaining dedicated step in the chain: Final Business Reality Corpus Audit (Step 8) — a read-only audit over the
  full ≥1480 single scenarios + 50 sequential simulations.
