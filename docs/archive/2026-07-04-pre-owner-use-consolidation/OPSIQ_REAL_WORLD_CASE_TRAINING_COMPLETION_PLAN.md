# OpsIQ Real-World Case Training — Completion Plan

Branch `claude/opsiq-real-world-case-training` · base `57f4ea69` · HEAD `ff1041e` ·
classification `PRODUCTION_RUNTIME_TRAINING_READY`. Do not weaken any gate; do not open PR/merge.

## 1. Missing 30 domains (canonical 60 − covered 30)
Finance · Pricing · Margin · Sales · SOPs · Checklists · Process control · Process improvement ·
Staff management · Staff training · Staff workload/fairness · Hiring/firing/resource decisions ·
Maintenance/downtime · Delivery/logistics · Opportunity evaluation · Contract/quote evaluation ·
Location/local-market awareness · Remote-owner management · Multi-location/portfolio control ·
Quality control · Customer service · Brand/franchise constraints · Owner emotional/override discipline ·
Cybersecurity/data loss/payment fraud · Insurance/claim readiness · Emergency/disaster continuity ·
Reputation/social-media crisis · Loan/debt/EMI affordability · Asset purchase/payback decision ·
Local competition/price-war response · Seasonality/festival/weather demand planning ·
Succession/key-person dependency · Exit/sale readiness.
(Canonical names fixed in `REQUIRED_DOMAINS`; current covered tags normalized to them.)

## 2. Plays/case-patterns needed
Augment existing plays with the canonical domains they MATERIALLY affect (e.g. cashflow_squeeze →
Finance + Loan/debt/EMI affordability; underpriced_contract → Pricing + Margin + Opportunity + Contract/
quote; turnaround → Finance + Owner emotional/override; over_expansion → Multi-location/portfolio).
Add **14 new sourced plays**: staff_sop_training (SOPs/Checklists/Process control+improvement/Staff
training/Staff management/Quality control/Customer service), staff_overwork_hiring (Staff workload/
fairness/Hiring-firing/Remote-owner), maintenance_downtime (Maintenance/downtime/Equipment/Asset
payback), delivery_logistics_fail (Delivery/logistics/Customer service/Reputation), price_war_response
(Local competition/Pricing/Margin/Sales), seasonality_planning (Seasonality/Inventory/Capacity),
cyber_payment_fraud (Cybersecurity/Continuity/Proof), insurance_disaster (Insurance/Emergency-disaster/
Continuity/Cash), reputation_social_crisis (Reputation-social/Customer complaints/Customer service/
Brand), franchise_brand_conflict (Brand/franchise/Compliance/Multi-location/Location-market),
exit_sale_readiness (Exit/Succession/Finance/Self-eval), asset_purchase_payback (Asset payback/Capital
allocation/Cash/Maintenance), local_market_remote (Location-market/Remote-owner/Multi-location/Owner
workload), sales_pipeline (Sales/Customer acquisition/Pricing/Margin/Marketing).

## 3. Current case count per missing domain
0 each (none tagged yet).

## 4. Target case count per missing domain
≥20 each (each new play × 36 categories × 4 variants ⇒ ~144 each); criticals ≥40 + ≥10 adversarial +
≥10 holdout + ≥5 multi-turn + ≥5 production-runtime.

## 5. Source-pattern lineage strategy
Reuse fitting existing `SRC-*` records; add 6 new web-sourced metadata-only records (cyber/ransomware,
disaster/insurance, price-war, seasonality/demand, succession/exit, payment-fraud) — anonymized,
no PII, no long copied text. Each new play cites a real `sourceRef`.

## 6. Browser/E2E representative flow plan
10 representative flows through the command-center whole-business card against seeded postgres:16:
cash crisis, bad contract, marketing-blocked, owner-overload, proof/fake-completion, vendor, delivery,
growth/scale, shutdown/pivot, multi-location/remote. Seed a DB-backed owner business per representative
constraint; assert plan/dominant/do-not-do/next/owner-offload/proof/reassessment/growth/arbitration/
confidence visible; ≥3 mobile smoke. (Run if browser+DB tooling available; else record exact blocker.)

## 7. Standalone learning persistence plan
`public-learning.ts`: run training-split cases through the runtime, detect weak/failed (and deliberately
weak advisors for trap cases), classify failure by domain/category/severity/stage/conflict, generate
governed `LearningArtifact`s + domain/whole-business playbook entries + do-not-repeat/caution/proof/
offload rules + regression cases, persist via the governed store (workspace-private, versioned, approval-
gated), rerun and prove improvement, prove no cross-workspace/holdout/source-text leakage, block global
promotion from a single case. Evidence targets per prompt §3.

## 8. Regression persistence plan
Each generated failure/trap yields a regression case (provenance to source case); regression set rerun
must keep dominant constraint + block bad action; ≥100 regression artifacts.

## 9. Tests required
Domain: 60/60 coverage, materiality (no tag outside a play's declared material set + critical→constraint
affinity), per-domain ≥20, critical ≥40/≥10 adv/≥10 holdout/≥5 multi-turn/≥5 runtime, weak-domain blocks
CORE/EXPERT. Scoring: runtime ≥90, holdout ≥88, unsafe 0, regression 0 after extension. Learning:
failure→persisted artifact, artifact changes output, scope-limited, global-promotion blocked, do-not-
repeat suppresses, regression passes, no cross-workspace/holdout leakage. Browser: 10 flows pass + ≥3
mobile + report.

## 10. Expected final classification gates
`CORE_READY` only with 60/60 domains + critical thresholds + runtime ≥90 + holdout ≥88 + unsafe 0 +
regression 0 + learning persistence working + ≥10 browser flows + privacy/source-register pass + no weak
category/severity + no harness-only path. `EXPERT_READY` adds the volume/category/domain/score gates.
Honest intermediate rungs (DOMAIN_COVERAGE_READY, LEARNING_PERSISTENCE_READY, BROWSER_REPRESENTATIVE_
READY) used until all are proven.

## Slices
- **A** domain extension (sources + REQUIRED/CRITICAL domains + augment + 14 plays + coverage/materiality
  tests + runtime sweep) → commit.
- **B** standalone learning + regression persistence + tests + report → commit.
- **C** 10 browser representative flows + seed + run + report → commit (or record env blocker).
- **D** update report + register + honest classification → commit + push.
