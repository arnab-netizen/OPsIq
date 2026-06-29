# OpsIQ Final Readiness Blocker Closure — Plan

Branch: `claude/opsiq-jarvis-360-audit-m8jro7` · Base HEAD: `c684029` · Do NOT merge / no PR yet.

## 1. owner_workload current score and failed cases
Current: **54.8** (critical, below 90). Cause: `baseAdvise` omits `ownerWorkloadReduction` by default
(historical "blind spot"); the domain grade only credits a present offload + keywords, so most cases
score ~0.55. Failed cases = essentially all (offload absent unless learning/goal injects it).

## 2. Missing owner-workload behaviours
The base advisor must ALWAYS emit a relevant offload covering: owner decision vs staff execution,
what OpsIQ prepares/monitors, staff proof, batch, defer, ignore-for-now, standing instruction,
exception-only escalation, next touchpoint, estimated reduction. Boilerplate ("owner should review")
must fail.

## 3. vendor_supplier coverage gap
0 relevant cases in the seed corpus. Need ≥25 vendor cases (incl. ≥10 adversarial, ≥10
location-sensitive, ≥10 cash/working-capital, ≥5 multi-location reliability) and real advisor vendor
reasoning so the domain scores ≥90 with 0 unsafe.

## 4. delivery_logistics weak cases
Score 70 on ~40 cases; generic grade. Need ≥25 delivery cases (incl. ≥10 adversarial, ≥10
location, ≥10 cash/unit-economics, ≥5 remote-owner) and real delivery reasoning → ≥90.

## 5. Real DB/domain ingestion gap
`owner-advice-runtime` builds `OwnerBusinessContext` from a single mapped case. Need a per-domain
ingestion seam (16 domains) with explicit `DATA_SOURCE_MISSING`, confidence lowering when sources
are absent, and a classifier gate that fails readiness if a critical domain uses fake data.

## 6. Exact files to change
- `src/behavioral-validation/schema.ts` — add `ownerWorkloadPlan`, `vendorGuidance`, `deliveryGuidance`.
- `src/behavioral-validation/advisor.ts` — emit owner-workload offload by default + vendor/delivery reasoning.
- `src/behavioral-validation/whole-business/domains.ts` — stricter owner_workload grade; vendor/delivery relevance+grade; default corpus includes new cases.
- NEW `src/behavioral-validation/whole-business/domain-cases.ts` — vendor + delivery case generators.
- `src/services/owner-mode/owner-advice-runtime.service.ts` — per-domain ingestion + DATA_SOURCE_MISSING + confidence.
- `src/behavioral-validation/whole-business/classification.ts` — fail readiness on fake critical-domain data.
- `OPSIQ_EXPERT_BENCHMARK.json` — regenerate after owner-workload change.
- `src/__tests__/behavioral-validation/advisor.test.ts` — update owner-workload expectation.

## 7. Tests to add
owner-workload (10), vendor (10), delivery (10), DB ingestion (10), plus owner-workload ratchet.

## 8. Validation modes to rerun
domain-competency, production-smoke, production-core (sampled), production-holdout,
production-adversarial, production-regression, production-collective-management.

## 9. Expected classification
If all critical domains (incl. owner_workload) ≥90, vendor/delivery ≥90 with 0 unsafe, collective ≥90,
runtime ≥90, holdout ≥88, adversarial unsafe 0, regression 0, no fake critical data, guards red →
**READY_FOR_REAL_WORLD_CASE_TRAINING**. Otherwise the true intermediate rung (PRODUCTION_DB_INGESTION_*
or WHOLE_BUSINESS_EXPERT_CORE_READY). Will report the measured rung honestly.

## Slices
| # | Slice | Status |
|---|---|---|
| 1 | owner-workload critical fix | pending |
| 2 | vendor + delivery coverage | pending |
| 3 | production DB/domain ingestion | pending |
| 4 | final validation + report | pending |

## Prohibitions
No scorer weakening. No score inflation. No averaging away a failing critical domain. No fake DB
ingestion. No duplicate engines. No merge. Record any command that cannot run.
