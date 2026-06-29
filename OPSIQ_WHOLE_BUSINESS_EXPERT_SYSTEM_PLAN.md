# OpsIQ Whole-Business Expert Operating System — Plan

Branch: `claude/opsiq-jarvis-360-audit-m8jro7` · Base HEAD: `ff6f586` · Do NOT merge.

Builds on `src/behavioral-validation/` (incl. `expert/`). New whole-business engines live under
`src/behavioral-validation/whole-business/`; the production runtime foundation lives under
`src/services/owner-mode/owner-advice-runtime.service.ts` and composes existing services + engines.

## 1. Individual domains (36)
Strategy, Finance, Cash flow, Budgeting/capital, Pricing/margin, Sales, Marketing, Customer
acquisition, Customer retention, Reputation/complaints, Operations, SOP/checklist, Staff management,
Staff training, Process improvement, Equipment/capacity, Inventory/stock, Vendor/supplier,
Opportunity eval, Contract/quote, Compliance/professional-review, Proof/anti-gaming,
Fraud/collusion, Owner-workload, Approval-memory/standing-instructions, Self-evaluation/learning,
Location/local-market, Remote-owner, Multi-location/portfolio, Scaling/expansion,
Shutdown/pivot/stop-loss, Quality control, Delivery/logistics, Working-capital/AR/AP, Risk
management, Business continuity.

## 2. Current score per domain
Measured by the domain competency matrix (slice A) over the case corpus and recorded in the report.
Each domain reports total cases, score, unsafe, weak case types/locations, failure labels,
correction artifacts, regression cases, playbook, readiness (NOT_READY / BASELINE_READY /
PARTIAL_EXPERT / EXPERT_READY).

## 3. Domains below expert threshold
To be enumerated post-measurement (expected: several human-factors / long-tail domains below 90 —
honest measurement, not faked).

## 4. Whole-business coordination gaps
No unified production owner-advice runtime that ingests business/domain state, runs cross-domain
arbitration, and returns one integrated operating plan. Addressed by slice F (foundation).

## 5. Cross-domain conflict cases
20 conflict archetypes (cash↔marketing, sales↔margin, growth↔capacity, quality↔acquisition,
staff↔profit, owner-workload↔control, contract↔working-capital, expansion↔unit-economics,
equipment↔runway, discount↔retention, compliance↔revenue, vendor-savings↔reliability,
inventory↔dead-stock, remote-owner↔proof, multi-location↔attention, shutdown↔sunk-cost,
hiring↔process, automation↔discipline, franchise-rules↔local-economics, survival↔long-term).

## 6. Collective business outcome tests required
Disconnected-domain-advice fails; correct top priority passes; wrong top priority fails; cash/growth,
staff/customer tradeoffs; owner-overload penalised; whole-business score in report.

## 7. Production owner-advice runtime gap
No unified runtime exists. Build smallest safe foundation composing existing services + engines;
workspace-scoped; reads learning; runs arbitration; returns whole-business plan; validation runs
through it. Full per-domain DB ingestion remains the documented production gap.

## 8. Target final classification
Honest intermediate rung — expected `WHOLE_BUSINESS_EXPERT_CORE_READY` (NOT
READY_FOR_REAL_WORLD_CASE_TRAINING) because several critical domains will sit below the 90 floor and
the runtime is a composition foundation, not full DB-wired production. Will report the true rung.

## Slices

| # | Slice | Files | Status |
|---|---|---|---|
| A | Domain competency matrix (36 domains) | `whole-business/domains.ts` | done |
| B | Cross-domain arbitration engine | `whole-business/arbitration.ts` | done |
| C | Profitability/efficiency + growth-scale gates + business stages | `whole-business/{profitability,growth-gates,stages}.ts` | done |
| D | Whole-business operating plan + collective outcome scorer | `whole-business/{whole-plan,collective-scorer}.ts` | done |
| E | Collective case library (≥100 cross-domain cases) | `whole-business/collective-cases.ts` | done |
| F | Production owner-advice runtime + production validation modes | `services/owner-mode/owner-advice-runtime.service.ts`, `whole-business/production-runner.ts` | done |
| G | Report | `OPSIQ_WHOLE_BUSINESS_EXPERT_SYSTEM_REPORT.md` | done |

## Prohibitions
No public SaaS/billing/launch surface. No duplicate engines. Preserve gates/proof/arbitration/
memory/compliance + workspace scope. No merge. Record any command that cannot run.
