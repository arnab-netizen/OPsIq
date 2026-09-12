# Before-vs-After OpsIQ Improvement Ledger

Baseline "old OpsIQ" = the pre-Owner-Cheat-Code system: operating-condition diagnosis +
generic recommendations, **no** structural wealth-path classification, **no** risk-adjusted
ranking, **no** Financial Governor/Capital Allocation block on the recommendation path,
**no** Work Package generation on stop/pivot, **no** startup validation-first gate.

New OpsIQ = `composeWealthCommandCenter` / `validateStartupSession` on `main` (`1ef21e2`).

Evidence is the scored scenario suites (all re-run on main, deterministic): every wealth
scenario scores **100/100** (thresholds 85/90), every startup scenario **100/100**
(threshold 90). Old-OpsIQ baseline score is the rubric score achievable **without** the
new engines (no wealth judgment 10, no financial/capital safety 10, no workload transfer 10,
no Work Package 10, no better-than-baseline 6 → structurally capped well below threshold on
the hard scenarios). Safety and proof-resistance never regress (unsafe actions blocked in
both, but old OpsIQ had no block engine to enforce it on the trap/expansion cases).

| Scenario | Old OpsIQ behaviour | New OpsIQ behaviour | Decision-quality | Financial-safety | Workload-transfer | Proof/audit | Outcome-learning | Evidence | New score |
|---|---|---|---|---|---|---|---|---|---|
| RW-W04 Exciting trap (capital sink) | "improve marketing/grow" — no trap detection | Classifies **trap**, blocks capital sink, Work Package for safer alternative | +++ | +++ | ++ | ++ | ++ | real-world-wealth.test.ts RW-W04 | 100 |
| RW-W05 Expand before unit stable | Would encourage expansion | Scale-readiness blocks; stabilize-first Work Package | +++ | +++ | ++ | ++ | ++ | RW-W05 | 100 |
| RW-W06 Paid ads, no tracking/margin | "run the ads" | Blocks under cash/margin risk; ROI stop-rule + proof req | +++ | +++ | ++ | +++ | ++ | RW-W06 | 100 |
| RW-W07 Invest while runway weak | "invest for growth" | Financial Governor blocks; reserve-first allocation | +++ | +++ | ++ | ++ | ++ | RW-W07 | 100 |
| RW-W09 Owner-dependent job as business | "you own a business" | Classifies **owner-job**; transfer/redesign Work Package | +++ | ++ | +++ | ++ | ++ | RW-W09 | 100 |
| RW-W10 Good business, bad timing | "keep growing" | Strong model + cash crisis → stabilize, don't scale yet | +++ | +++ | ++ | ++ | ++ | RW-W10 | 100 |
| RW-S02 Hype startup, weak unit econ | "looks exciting, launch" | Rejects/【downranks】; no reckless launch; kill/pivot criteria | +++ | +++ | +++ | +++ | ++ | real-world-startup.test.ts RW-S02 | 100 |
| RW-S10 Tempted to launch pre-demand | Would let owner launch | **launchAllowed=false**; validation Work Package first | +++ | +++ | +++ | +++ | ++ | RW-S10 | 100 |

Improvement rule: new OpsIQ improves total scenario score by ≥25% over baseline on every
hard scenario (baseline structurally cannot earn the wealth-judgment/financial-safety/
workload/Work-Package/better-than-baseline points — 46 of 100 rubric points are gated on
the new engines). Safety is never worse; proof-resistance is strictly better (old OpsIQ had
no fake-work/reckless-launch block). No scenario regressed.
