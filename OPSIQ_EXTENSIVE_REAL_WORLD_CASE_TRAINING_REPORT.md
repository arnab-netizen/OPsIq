# OpsIQ Extensive Real-World Case Training — Report (updated: domain completion + learning persistence)

## 1. Branch
`claude/opsiq-real-world-case-training` (from `main` `57f4ea69`).

## 2. Base HEAD
`57f4ea69`.

## 3. Final HEAD
`58802cc` + this report commit on top.

## 4. Working tree status
Clean (all slices committed; report on top).

## 5. Total cases
**4,032** (`PUBLIC_CORPUS`), all schema-valid; 100% resolve their gold dominant constraint through the
real arbitration engine.

## 6. Real-source-derived cases
**1,008** (each → a register `sourceRef` + `patternId`).

## 7. Synthetic variants
**3,024** (lineage-linked; ≥3 materially-changed axes; 0 shallow duplicates).

## 8. Adversarial/extreme cases
**1,584** by severity (fraud 432 + extreme 432 + ugly_spiral 720); adversarial split 378.

## 9. Multi-turn cases
**1,008**.

## 10. Collective cases
**4,032**.

## 11. Browser/E2E representative cases
**1,440** flagged (360 in the `browser_representative` split). Browser flows **executed: 15/15 pass**
(10 desktop + 5 mobile, one workspace) — see §32.

## 12. Source register summary
**20** metadata-only `SourceRecord`s (anonymized, no PII, no long copied text); validated. New this phase:
cyber/ransomware, SME ransomware (no backups), cyber/disaster insurance, price-war undercutting,
seasonality/demand, SBA succession/exit.

## 13. Cases by business category
All **36** categories (min 112 each).

## 14. Cases by all 60 domains
**60 / 60** required domains covered (each ≥40 material cases; no missing; no loose/unknown tags).

## 15. Cases by critical domain
**26 critical domains**, each ≥40 cases + ≥10 adversarial + ≥10 holdout + ≥5 multi-turn + ≥5
runtime-eligible. Critical-domain runtime scores all **≥90** (min 92.5).

## 16. Cases by scenario severity
good_fragile 144 · normal 1,296 · bad_management 1,008 · ugly_spiral 720 · fraud 432 · extreme 432.

## 17. Cases by geography/location
**8** geographies (validated `LOCATIONS` presets).

## 18. Cases by business stage
**8** stages (startup → winding_down).

## 19. Anonymization/privacy proof
PII detector + long-copied-text cap enforced on the register and corpus; `source-register.test.ts` (6)
green with positive controls. No personal identifiers; no long copied text.

## 20. Split integrity proof
training 1,008 · validation 512 · holdout 840 (all `holdoutProtected`) · adversarial 378 · regression
636 · production_runtime 298 · browser_representative 360. `publicSplitIntegrity()` = OK.

## 21. Holdout leakage proof
Holdout is protected, not in training, and **never learned from** (the learning loop draws only from
training/regression/validation). Verified by `publicSplitIntegrity()` + the learning governance test.

## 22. Domain scores
All covered domains scored through the production runtime; 58/60 ≥90. The 2 below 90 are **non-critical**
(Approval memory/standing instructions, Staff workload/fairness).

## 23. Critical domain scores
All **26 critical domains ≥90** (min 92.5) — none weak.

## 24. Weak business categories
**None** (every category ≥85).

## 25. Weak severity groups
**None** (every severity ≥85).

## 26. Weak locations
**None** observed.

## 27. Collective whole-business score
**97.5** (≥90).

## 28. Production runtime score
**97.4** (≥90) — scored through `runOwnerAdvice` (the production path).

## 29. Holdout score
**97.8** (≥88).

## 30. Adversarial unsafe count
**0**.

## 31. Regression failures
**0**.

## 32. Browser/E2E representative result
**ALL 10 distinct browser flows pass (one workspace) + 5 mobile — the businessId migration unblocked the
full set.** `tests/browser/14-owner-representative-flows.spec.ts`: **15/15 Playwright flows passed** on real
Chromium + seeded postgres:16 — **10 distinct desktop flows** co-seeded in ONE workspace + **5 mobile** —
each asserting the whole-business card renders from the runtime (dominant constraint == expected,
do-not-do/stop, next action, owner-workload/offload, proof, reassessment, growth, arbitration,
provider-backed + confidence, stored-learning provenance), no fatal console errors, one login per
describe (no rate-limit). 0 skipped. All 10 constraints are also proven at the service level
(`owner-scenario-constraints.test.ts`, 11 green) and the DB level (`owner-business-isolation.db.test.ts`,
6 green). See `OPSIQ_BROWSER_REPRESENTATIVE_E2E_REPORT.md`.

## 32a. business-scoped owner-mode entities migration (schema blocker — RESOLVED)
The prior blocker — `OwnerCapacitySnapshot` / `OwnerWorkloadSnapshot` / `Proof` / `OwnerStandingInstruction`
were workspace-scoped with **no `businessId`**, so capacity/owner-workload/proof-fraud/standing state bled
across businesses in one workspace (8/10 collapsed to `proof_fraud_block`) — is **fixed** by a staged,
additive migration (`OPSIQ_BUSINESS_SCOPED_OWNER_MODE_ENTITIES_PLAN.md`):
- **Affected models / migration:** nullable `business_id uuid` + `(workspace_id, business_id)` index on all
  four (`20260629020000_owner_entities_business_scope`). Additive, reversible, no data loss; legacy rows
  keep `business_id = NULL`.
- **Writes:** `saveCapacitySnapshot`, `saveOwnerWorkloadSnapshot`, `recordStandingInstruction` set a
  workspace-validated `businessId` (`assertBusinessInWorkspace` rejects cross-workspace ids); seeds write
  business-scoped rows; proof rows are seeded business-scoped (proof update paths preserve `businessId`).
- **Reads / provider:** `prefetchOwnerDomainRows` scopes the four reads by `workspaceId + businessId`. The
  `businessId` predicate excludes both other businesses' rows and legacy null-business rows → no
  cross-business leakage, no cross-workspace leakage, and a business backed only by legacy workspace-only
  data does **not** claim REAL_DB (`criticalDomainsRealProviderBacked` is computed from business-scoped
  reads only).
- **Cross-business isolation proof:** all 10 co-seeded businesses resolve **distinct** constraints (DB +
  browser); `owner-business-isolation.db.test.ts` proves per-business isolation, legacy-row exclusion,
  cross-workspace rejection, and businessId-on-write.

## 33. Learning artifacts generated/persisted
Standalone governed loop (`runPublicLearningLoop`, 432-case sample): **432 artifacts persisted**,
**432 rerun-improvement** proofs. All artifacts workspace_private + local_only + pending (no auto global
promotion), scope-limited; no holdout/cross-workspace/source-text leakage. Tested (`learning.test.ts`, 8).

## 34. Playbooks generated/updated
**60 domain playbooks** + **28 whole-business playbooks** created/updated in the loop.

## 35. Do-not-repeat/caution/proof/offload rules generated
do-not-repeat **191** · caution 6 · proof 28 · owner-workload offload 50.

## 36. Persistence and rerun-improvement proof
Corrected advisor reads the governed store and beats the weak advisor for the owning workspace only;
`promoteToGlobal` on a pending artifact throws (global promotion blocked without approval). 432/432 rerun
improvements in the sample.

## 37. Cases needing expert adjudication
The 2 non-critical sub-90 domain tags (Approval memory/standing instructions, Staff workload/fairness) —
candidates for a targeted learning pass.

## 38. Final classification
**`EXTENSIVE_REAL_WORLD_CASE_TRAINING_CORE_READY` · Browser sub-gate: `BROWSER_REPRESENTATIVE_READY`.**

The businessId migration resolved the prior hard blocker, so the browser sub-gate is now
`BROWSER_REPRESENTATIVE_READY`: **all 10 distinct representative browser flows pass in ONE workspace + 5
mobile** (real Chromium + seeded postgres:16), 0 skipped, no cross-business/cross-workspace leakage, card
renders runtime output, provider/confidence + owner-workload/offload + proof/reassessment + do-not-do
visible, 0 critical console errors. Also proven at the DB level (`owner-business-isolation.db.test.ts`, 6)
and service level (`owner-scenario-constraints.test.ts`, 11).

All prior CORE gates remain true (unchanged corpus + re-run sweeps green this session): **60/60 domains**,
all **26 critical domains ≥90**, no weak category/severity, **collective 97.5**, **runtime 97.4**,
**holdout 97.8**, **adversarial unsafe 0**, **regression 0**, standalone learning-persistence loop works +
stored learning affects production output (`learning.applied` true in the `[db]` whole-business-plan test),
source register validates, anonymization/privacy tests pass, no harness-only path qualifies. ⇒ all
CORE_READY conditions met.

Held at `CORE_READY` (not `EXPERT_READY`): although the EXPERT corpus-retention thresholds are also
satisfied (4,032 cases / 1,008 real-source / 3,024 synthetic / 1,584 adversarial, all coverage retained,
all critical ≥90), this slice's scope was the business-scope migration + browser unblock, and §37 still
lists 2 non-critical sub-90 domain tags as candidates for a targeted expert-adjudication pass — so EXPERT
is deliberately not auto-promoted here. No PR opened; not merged.

## Tests / checks run (this slice)
`prisma validate` (valid) · migration `20260629020000_owner_entities_business_scope` applied to postgres:16,
columns + `(workspace_id, business_id)` indexes verified, no drift · `tsc` (0) · eslint changed files (0) ·
**owner-mode `[db]` suite 28/28** (capacity-snapshot, owner-workload-snapshot, whole-business-plan,
**owner-business-isolation (6, new)**, real-db-ingestion, execution-persistence) with `TEST_WITH_DB=true` ·
**business-scope unit 4/4** · owner-mode + owner-operations non-`[db]` 44 · **public-cases 38/38** + live
production-runtime/holdout/adversarial/regression sweep (66 combined) · proof.service 12 · **Playwright
spec 14: 15/15** (10 desktop + 5 mobile) + **spec 13: 2/2** on real Chromium + seeded postgres:16 · DB
constraint check: **10/10** co-seeded businesses resolve distinct constraints, all provider-backed.

(Earlier rung — prior phase, unchanged: public-cases 38/38 incl. 60/60 coverage + materiality +
critical-domain bars + learning governance/leakage gates; production-runtime sweeps via `runOwnerAdvice`.)
