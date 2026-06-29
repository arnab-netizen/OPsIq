# OpsIQ Real DB Domain Ingestion — Plan

Branch: `claude/opsiq-jarvis-360-audit-m8jro7` · Base HEAD: `23d0830` · No PR / no merge.

## Environment constraint (recorded)
`TEST_WITH_DB` unset; `DATABASE_URL` is a Neon endpoint that is **unreachable from this sandbox**
(connection hangs/times out via the proxy). Therefore `[db]`-gated DB proof **cannot run locally**.
Per §6, DB proof is deferred to CI; the honest ceiling without observed DB proof is
`DB_PROVIDER_READY_DB_PROOF_PENDING`, not READY. Providers are written against the **typed** Prisma
client so `tsc` validates every model/field access even though execution is deferred.

## 1–5. Critical domain → real DB source → provider status
| Critical domain | Real DB model/service | Provider status |
|---|---|---|
| cash_flow | OwnerCashflowSnapshot / OwnerFinancialSnapshot / BusinessConditionProfile | REAL_DB |
| pricing_margin | OwnerFinancialSnapshot (revenue/COGS/fixed) → margin | REAL_DB_SERVICE |
| working_capital | OwnerWorkingCapitalItem (receivable/payable ageing) + Cashflow receivables/payables | REAL_DB |
| budgeting_capital_allocation | BudgetPeriod / BudgetLine / OwnerBudgetAction | REAL_DB |
| capacity_equipment | OwnerCapacitySnapshot / OwnerEquipment | REAL_DB |
| staff_process_control | OwnerProcess / OwnerStaffSkill / OwnerSopSnapshot | REAL_DB |
| proof_anti_gaming | Proof / ProofRequirement (duplicate/stale/self-review) | REAL_DB |
| compliance_professional_review | OwnerComplianceItem (expiry/status) | REAL_DB |
| opportunity_contract_evaluation | no persisted model — opportunity terms arrive as request input | CONTEXT_PROVIDED (justified: live opportunity) |
| owner_workload_reduction | OwnerWorkloadSnapshot / OwnerStandingInstruction / OwnerAttentionEvent / OwnerApprovalMemory | REAL_DB |
| self_evaluation_learning | OwnerSelfEvaluation / OwnerDoNotRepeatRule / BehavioralLearningArtifact | REAL_DB |
| local_market_context_awareness | OwnerBusiness.location/currency | REAL_DB |
| customer_quality_reputation | OwnerOperationsSnapshot/Findings (complaints/rework) | REAL_DB_SERVICE |
| scaling_expansion | OwnerCapacitySnapshot.growthSafe/expansionTriggered | REAL_DB_SERVICE |
| stop_loss_pivot_shutdown | BusinessConditionProfile (survival/severity) | REAL_DB |
| profitability_efficiency | OwnerFinancialSnapshot (margin/efficiency) | REAL_DB_SERVICE |
| fraud_collusion_prevention | Proof.duplicateFlagged + Escalation + OwnerWorkingCapitalItem reconciliation | REAL_DB |
| b2b_receivables_payment_terms | OwnerWorkingCapitalItem (receivable due dates) + Cashflow receivablesOverdue | REAL_DB |

**Domains with true DB source:** all except opportunity_contract (CONTEXT_PROVIDED, justified).
**No source / DATA_SOURCE_MISSING (non-critical):** sop_checklist (partial via OwnerSopSnapshot),
staff_training (OwnerTrainingRecommendation) — wired where models exist.

## 6. Confidence effect if missing
A provider returns `missing`/`freshness`/`confidence`. Missing critical data → realData=false →
`criticalDomainsRealProviderBacked=false` → blocks READY and lowers runtime stated confidence; stale
data (record older than freshness window) lowers confidence and may block high-risk advice.

## 7. Tests required
Provider unit tests (DI'd fake db rows — typed), workspace-isolation tests, ingestion report tests,
classification tests (fixture-only/context-only cannot pass; real-provider passes), `[db]`-gated
seed→provider→runtime read-back test (CI).

## 8. DB-backed validation plan
`scripts/seed-owner-db-case.ts` inserts one full owner-business with persisted finance/cashflow/
working-capital/capacity/proof/compliance/workload/standing-instruction/self-eval/learning/location
records; `[db]` test reads them back THROUGH the providers and the runtime, asserts output changes
when a DB value changes, workspace isolation, missing/stale lowers confidence. Runs in CI (skipped
locally — DB unreachable).

## 9. Final readiness gates
READY only if: every critical domain REAL_* or justified CONTEXT_PROVIDED, none DATA_SOURCE_MISSING,
production runs provider-backed runtime, DB proof passes (CI), all prior gates green, adversarial
unsafe 0, regression 0, command center works, stored learning used, no leakage. Without observed DB
proof here → `DB_PROVIDER_READY_DB_PROOF_PENDING`.

## Slices
| # | Slice | Status |
|---|---|---|
| 1 | Real DB providers + async seam (prefetch) | done |
| 2 | Ingestion + classification require real provider data | done |
| 3 | DB seed + [db] read-back/runtime/isolation tests | done |
| 4 | Final validation + report | done |

## Prohibitions
No fake DB ingestion. No marking a provider real unless it reads persisted data. No scorer weakening.
No readiness-gate weakening. Workspace-scoped, no leakage. No merge.
