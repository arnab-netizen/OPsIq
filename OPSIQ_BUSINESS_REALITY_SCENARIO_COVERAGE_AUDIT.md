# OpsIQ Business-Reality Scenario Coverage Audit (hostile)

Baseline = **`BASELINE_CHAOS_CORPUS_V1`** = 180 counted (165 corpus = 15 categories × 11 sourced patterns + 15
independent gold). 26 unique sources. Proof: DB 180/180, desktop 180/180, **full mobile 180/180**. Action-status
distribution: owner_decision_required 116, blocked 64 (chaos is adversarial — never proceeds; the other 3
statuses proven by the safe-action scenarios). The 11 patterns: weak_unit_economics_scale, owner_overload,
quality_complaints, seasonality_planning, local_market_remote, cashflow_squeeze, over_expansion,
compliance_shutdown_risk, fake_completion_proof, fake_vendor_fraud, cyber_payment_fraud (14–15 each).

**Every one of the 180 is a single-shot, cross-sectional snapshot.** There are 0 sequential/time-series
scenarios, 0 explicitly OOD-tagged scenarios, and 0 owner-on-ship scenario cases (the shadow-pilot MODE exists,
but no scenario PACK exercises it). Coverage is judged sufficient ONLY where a pack materially exercises the
dimension end-to-end, not because one example exists.

| # | Dimension | Existing count (of 180) | Src | Gold | DB | Desktop | Mobile | Sufficient? | Min additional |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Daily operating | ~28 (owner_overload, quality_complaints partial) | 26 | few | ✓ | ✓ | ✓ | **No** — no routine/small-leak daily loop | 300 (Daily Ops Pack) |
| 2 | Repetitive small-leak | ~0 explicit | — | 0 | — | — | — | **No** | within Daily Ops (leak subset) |
| 3 | Weekly management/trend | ~14 (seasonality) | few | 1 | ✓ | ✓ | ✓ | **No** — no trend/time series | 150 (Weekly Pack) |
| 4 | Growth/profit/scaling | ~28 (weak_unit_economics, over_expansion) | few | 2 | ✓ | ✓ | ✓ | Partial | 150 (Growth Pack) |
| 5 | Good-business safe-proceed | 15 corpus good + safe-action scenarios | few | 1 | ✓ | ✓ | ✓ | Partial (safe-proceed via safe-action set) | folded into packs |
| 6 | Bad-business correction | ~60 (bad class) | many | ~5 | ✓ | ✓ | ✓ | Partial | folded |
| 7 | Finance/cash/capital allocation | ~14 (cashflow_squeeze) | few | 3 | ✓ | ✓ | ✓ | **No** — no capital-allocation choices | 120 (Finance Pack) |
| 8 | Staff/proof/anti-gaming | ~28 (fake_completion_proof, owner_overload) | few | 2 | ✓ | ✓ | ✓ | Partial — no multi-step gaming | 120 (Staff/Anti-Gaming Pack) |
| 9 | Customer/vendor/market | ~42 (quality_complaints, fake_vendor_fraud, local_market_remote) | few | 3 | ✓ | ✓ | ✓ | Partial | 100 (Customer/Vendor Pack) |
| 10 | Local/legal/professional boundary | ~14 (compliance_shutdown_risk) | few | 2 | ✓ | ✓ | ✓ | **No** — only 1 boundary pattern; 15 boundary areas required | 100 (Boundary Pack) |
| 11 | Ugly/fraud/failure | ~99 (ugly class) | many | ~9 | ✓ | ✓ | ✓ | Partial | folded into Crisis Pack |
| 12 | Extreme tail-risk | ~14 (over_expansion, cashflow) | few | 1 | ✓ | ✓ | ✓ | **No** — no shock/black-swan pack | 150 (Crisis Pack) |
| 13 | Owner-unavailable/on-ship | 0 scenario cases (mode exists) | — | 0 | — | — | — | **No** | via sequential sims + Daily Ops subset |
| 14 | Customer/vendor manipulation | ~28 (fake_vendor_fraud, cyber) | few | 1 | ✓ | ✓ | ✓ | Partial | folded into Adversarial Pack |
| 15 | Adversarial/LLM/security | ~14 (cyber_payment_fraud) | few | 1 | ✓ | ✓ | ✓ | **No** — no prompt-injection/LLM-abuse cases | 50 (Adversarial/Security Pack) |
| 16 | Sequential multi-day/week | **0** | — | 0 | — | — | — | **No** — none exist | 50 sequential simulations |
| 17 | Shadow-pilot incomplete-real-data | 0 scenario cases (mode + tests exist) | — | 0 | — | — | — | **No** | subset of sequential sims |
| 18 | Live-outcome measurement | 0 (out_of_scope_until_live_pilot) | — | 0 | — | — | — | N/A — needs live data; guardrail forbids claim | 0 (guardrail only) |
| 19 | Unknown/novel/OOD | 0 explicitly-tagged (handled via missing-critical) | — | 0 | — | — | — | **No** — no OOD-tagged pack | 110 (Unknown/OOD Pack) |

## Hostile verdict
- **Sufficient today:** the 180 baseline proves cross-sectional, single-shot handling across 11 real-world
  patterns × 15 archetypes, at every OpsIQ layer (runtime, DB, desktop, mobile), with correct action-status
  gating and no unsafe/proceed output — a real, non-trivial capability.
- **Insufficient for a broad known-to-unknown claim:** no sequential/time simulations, no OOD-tagged pack, no
  capital-allocation / weekly-trend / boundary-breadth / adversarial-security packs at scale, no owner-on-ship
  scenario pack. Dimensions 1,2,3,7,10,12,13,15,16,17,19 are **not sufficient**.
- **Do not overclaim:** the baseline is `BASELINE_CHAOS_CORPUS_V1` (180), not "business reality covered". The
  expansion plan (`OPSIQ_KNOWN_TO_UNKNOWN_CORPUS_EXPANSION_PLAN.md`) specifies the 1,250 + 50 needed, added in
  future sourced, gold-anchored, ledgered PRs — no fabricated volume in this slice.
