# OpsIQ Daily Operations Pack (300) — Plan

> Pack 3 of the known-to-unknown corpus expansion. Proves OpsIQ handles ordinary day-to-day business reality
> **without over-escalating, overburdening the owner, or missing small leaks** — safe `proceed` / `cautious_proceed`
> where appropriate, owner-gating when needed, proof/reassessment always, and workload-aware delegation. Owner
> Mode; minimum-code (data + pure expander + tests + specs) reusing the merged `business-reality-scenario`
> contract and the proven DB/browser seed path. No new engine.

## 1. Base HEAD
`8cc6cbb1` (main; PR #67 merge — Staff/Proof/Anti-Gaming Pack 120, `STAFF_PROOF_ANTIGAMING_PACK_READY_MERGED`).
Baseline to be re-verified before implementation completes: prisma / tsc / eslint / ratchet + the full
no-regression set (business-reality, OOD, Staff/Proof, chaos-180, owner-pilot, AI-supervisor, action-status,
source/privacy, business-scope, max-reliability).

## 2. Why Daily Operations is next
Packs 1–2 (Unknown/OOD, Staff/Proof) proved OpsIQ handles the *hard/adversarial* tail safely (escalate, block,
demand proof). The complementary risk is the opposite failure mode: **over-caution** — escalating or blocking
routine work, overburdening the owner, or nagging for proof on trivial actions. Daily Operations proves OpsIQ
stays *useful* on the common case: it can safely `proceed` / `cautious_proceed` on routine reversible actions
under an owner/SOP grant, while still catching the small leaks and owner-gating the genuinely material calls. It
is the natural breadth pack after the two safety packs.

## 3. Taxonomy (12 subcategories × 25 = 300)
1. `routine_order_handling` — 25
2. `pickup_delivery_coordination` — 25
3. `customer_complaint_minor` — 25
4. `staff_attendance_punctuality` — 25
5. `daily_task_completion` — 25
6. `inventory_stock_small_mismatch` — 25
7. `cash_collection_small_reconciliation` — 25
8. `routine_discount_price_exception` — 25
9. `equipment_idle_minor_maintenance` — 25
10. `proof_quality_routine_issue` — 25
11. `owner_time_limited_decision` — 25
12. `small_repeated_operational_leak` — 25

Each of the 300 is a distinct authored vignette (no filler), inherits a real source, and carries a deterministic
`seed` plan so the existing DB path resolves the intended disposition.

## 4. Source strategy
~28 privacy-clean `SourceRecord`s (`SRC-DOP-*`), validated by the existing `sourceRecordSchema` (`privacyRisk=low`,
no PII). Types: `staffing_ops`, `sector_example`, `review_complaint_pattern`, `finance_example`,
`gov_sme_guidance`, `case_study`, `business_blog`. Composite/sector sourcing (honest, not fabricated); every
scenario source-backed via `sourceRefs`; ≥1 source per subcategory.

## 5. Independent gold strategy
**12 independent gold** (`independentGold=true`), ≥1 per subcategory — the most diagnostic routine case in each
family (e.g. the small-leak that must be caught, the discount that crosses a policy line, the owner-gate that must
not be auto-proceeded).

## 6. Action-status distribution target (proceed/cautious more common than OOD / anti-gaming)
Within the required ranges, targeting: `proceed` **60** (45–75) · `cautious_proceed` **60** (45–75) ·
`need_more_data` **84** (60–90) · `owner_decision_required` **60** (45–75) · `blocked` **36** (15–45). Total 300.
All five statuses present; proceed + cautious ≈ 120/300 (routine safe work), reflecting daily-operations reality.

## 7. Proof-risk distribution (reuses the optional `expectedProofRiskState`)
Skews to `none` / `verified` (routine actions with acceptable proof), with `weak` / `stale` on the
`proof_quality_routine_issue` and small-leak families (→ need_more_data), and `staged` / `contradictory` only on
the rare blocked cases. High proof-risk (staged/contradictory/fabricated) is schema-refined to never proceed.

## 8. Input-quality distribution
Skews to `sufficient` / `high_confidence` (routine, well-understood), with `data_limited` / `owner_estimate_only`
on owner-decision cases and `critical_missing` on the need_more_data cases (routine action can't proceed until the
one missing figure is supplied). `conflicting` on contradiction/leak cases.

## 9. Owner-workload distribution
Explicitly workload-aware: most routine cases are `ownerWorkloadRisk=low` (delegable to OpsIQ+staff with proof);
`owner_time_limited_decision` + material owner-gates are `medium`/`high`. The pack proves OpsIQ does NOT route
trivial work to the owner — delegation is the default, owner-gating the exception.

## 10. DB proof strategy
Reuse `seedDailyOpsScenario` = `seedScenarioBusiness` + `chaosScenarioToKnobs(seed.dominant)` (+ optional
`sopRiskClass` / `stripCriticalData`), exactly as OOD + Staff/Proof. Dominant map: proceed → `profitable_growth`
+ SOP low; cautious → `profitable_growth` + SOP medium; need_more_data → `profitable_growth` + `stripCriticalData`;
owner_decision → `owner_workload` / `below_margin` / `capacity_feasibility` / `cash_survival`; blocked →
`compliance_block` / `proof_fraud_block`. All dominant→status mappings are already proven by the OOD + Staff/Proof
DB tests (110/110 and 120/120). `[db]`-gated test seeds all 300 into isolated businesses, runs real
`getOwnerWholeBusinessPlan`, asserts status==expected + dominant==expected, proceed/cautious only on
routine/SOP-granted/verified cases (never high-risk/critical-missing/safety/compliance/cash-critical/fraud),
proof + reassessment always present, cross-workspace isolation. Writes `OPSIQ_DAILY_OPERATIONS_PACK.run.json`.

## 11. Desktop proof strategy
`tests/browser/27-daily-ops-desktop.spec.ts` — real Chromium, 12 subcategory groups, renders the runtime-fed
Supervisor Summary from DB-backed data, asserts status label matches disposition, proof + reassessment visible,
advanced reasoning collapsed, and NO high-risk / compliance / fraud case reads "Proceed". Shardable
(`DOP_SHARD_INDEX`/`DOP_SHARD_TOTAL`). Target: all 300 (well above the 120/300 minimum); required subset (all
`blocked`, all `owner_decision_required`, all high-risk, all five statuses) must pass. Writes
`OPSIQ_DAILY_OPERATIONS_DESKTOP.run.json`.

## 12. Mobile proof strategy
`tests/browser/28-daily-ops-mobile.spec.ts` — 375×812, no horizontal overflow, same safety assertions. Target:
all 300 (min 120/300). Writes `OPSIQ_DAILY_OPERATIONS_MOBILE.run.json`.

## 13. CI strategy
New additive workflow `.github/workflows/daily-operations.yml`: `dop-db` job (migrate deploy + schema tests +
all-300 DB proof + exact-300 ledger assertion + artifact) and `dop-browser` 3-shard matrix (build, seed 300,
desktop + mobile). Additive only — does NOT modify `unknown-ood.yml`, `staff-proof-anti-gaming.yml`,
`chaos-exhaustive.yml`, or `owner-pilot-e2e`. (3 shards because 300 is larger; block-style artifact upload to
avoid the YAML-flow-map startup failure.)

## 14. No-regression strategy
Re-run prisma/tsc/eslint/ratchet + the full no-regression set (business-reality schema, OOD schema/DB, Staff/Proof
schema/DB, guardrail, shadow-pilot, exhaustive-chaos DB 180, action-status policy, AI-supervisor, owner-pilot,
source/privacy, business-scope isolation, learning-governance/adjudication, max-reliability). No schema change is
required for this pack (it reuses the existing contract incl. the proof/manipulation-risk optional fields), so all
590 prior scenarios (180 chaos + 110 OOD + 120 Staff/Proof + others) stay valid.

## 15. What will NOT be claimed
- NO live outcome / profit / public-SaaS claim (`liveOutcomeClaimAllowed=false` on all 300; no live data).
- NOT full 1,250-corpus readiness (this is Pack 3 of the expansion).
- NO global-learning promotion without adjudication (controlled learning stays workspace-scoped).
- NO new engine, parallel AI brain, AI autonomy, or duplicate engine.
- NO change to SaaS/billing/launch/marketing/Stripe/Lemon Squeezy/enterprise/external-integration surfaces.
- `proceed`/`cautious_proceed` are claimed ONLY for routine, reversible, safe, owner/SOP-approved actions with
  proof still required — never for high-risk, critical-missing, safety/legal/cash-critical, or fraud-risk cases.

## 16. Final classification gate
`DAILY_OPERATIONS_PACK_READY` only if all 300 schema+ledger-valid + DB-backed, browser/mobile risk proof passes,
all five statuses covered, proceed/cautious obey policy, no high-risk/critical-missing proceeds, no fake
confidence / generic advice / unsafe output / live claim, and no-regression green. Otherwise a lower classification
(`FAILED` / `SCHEMA_READY` / `DB_PROVEN` / `BROWSER_MOBILE_RISK_PROVEN`) is reported honestly.
