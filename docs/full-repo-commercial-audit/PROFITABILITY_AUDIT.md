# Profitability Audit — OpsIQ / Rebilix

Audit only. No billing/SaaS/Product-Hunt work performed (none required by an
Owner-Mode defect this slice).

## A. Does OpsIQ help the business become more profitable?
| # | Lever | Class | Evidence / note |
|---|---|---|---|
| 1 | Protects cash | STRONG | Real runway/cash-safety gate (`constraint-enforcer.ts:161-186`, `cash-safety-gate.ts`); fail-closed. |
| 2 | Prevents bad capital allocation | ADEQUATE | Capital-allocation + spend-governance engines; owner-budget override path enforces `assertOverrideAllowed`. Core `/api/run` guardrail is impact/confidence only, not runway (GAP notes). |
| 3 | Improves margins | ADEQUATE | Margin fields flow into wealth-path/BMQ + recommendations. |
| 4 | Improves retention/repeat | ADEQUATE | Growth retention-metrics engine present. |
| 5 | Reduces waste | ADEQUATE | Work Package targeting + fake-work resistance reduce wasted execution. |
| 6 | Improves staff productivity | STRONG | Delegated Work Packages + proof-gated completion. |
| 7 | Reduces owner time | STRONG | Owner-workload-transfer scoring (minutes saved). |
| 8 | Identifies profitable segments | ADEQUATE | Segmentation/value services exist. |
| 9 | Stops unprofitable growth | ADEQUATE | Guardrails + capacity-safety service gate growth recommendations. |
| 10 | Supports pricing decisions | ADEQUATE | Growth pricing-tiers/offers engines. |
| 11 | Supports capacity decisions | ADEQUATE | Capacity + workload snapshot services. |
| 12 | Marketing ROI discipline | ADEQUATE | Marketing domain + outcome measurement. |
| 13 | Defines measurable outcomes | STRONG | Outcome/KPI models with baseline + review window; outcome-verification SoD. |
| 14 | Learns what worked | ADEQUATE | Controlled-learning services with admission/harm/regression/rollback gates (guards against over-learning). |

## B. Can OpsIQ itself become profitable later?
| # | Question | Assessment |
|---|---|---|
| 1 | Who would pay | SMB owners / fractional operators wanting governed execution, not chat advice. |
| 2 | Why pay | Enforced execution + proof + financial safety + audit — hard to replicate with generic LLM tools. |
| 3 | Pricing model (later) | Per-workspace subscription; entitlement scaffolding already present (`/api/entitlement`, `/api/billing`). Out of scope to build. |
| 4 | Support burden | MODERATE — governed flows reduce "wrong answer" support, but the runtime-broken legacy Evidence routes and doc contradictions would generate tickets until closed. |
| 5 | Onboarding burden | MODERATE — guided shells + demo seed reduce it; four-dimension model has a learning curve. |
| 6 | Infra cost risk | pg pool sizing (GAP-REL-01) and Neon connection limits need explicit config before multi-tenant scale. |
| 7 | Expensive-to-support features | Live-AI paths (gated, manual-dispatch only) and cross-domain re-evaluation. |
| 8 | Must automate before SaaS | DB-level tenant enforcement (GAP-TEN-01) so isolation does not depend solely on every route being correct. |
| 9 | Must remain owner-approved | High-impact financial approvals (now server-gated), overrides, proof-gate bypass. |
| 10 | Churn risk | Broken-feature perception (legacy Evidence) and contradictory "readiness" docs. |
| 11 | Activation failure risk | If first diagnosis feels generic; mitigated by proof-gated Work Packages. |
| 12 | Must prove in pilots | Owner-workload reduction is real; tenant isolation at scale; proof-gate compliance under real staff. |

## Verdict
Business-owner profitability levers: **ADEQUATE→STRONG** — genuine cash/runway protection, proof-gated execution, owner-time reduction, and outcome measurement with over-learning guards. OpsIQ-product profitability: **plausible but gated** on closing GAP-TEN-01 (DB-level isolation before multi-tenant SaaS) and GAP-EVIDENCE-DRIFT-01 (don't ship a 500-ing feature). No architectural blocker to later monetization was found; entitlement/billing scaffolding already exists.
