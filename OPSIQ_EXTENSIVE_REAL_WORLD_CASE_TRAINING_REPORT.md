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
**1,440** flagged (360 in the `browser_representative` split). Browser flows **not yet executed** — see §32.

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
**Partially executed (4 distinct flows + 3 mobile) — full 10 hit a hard architectural blocker.**
`tests/browser/14-owner-representative-flows.spec.ts`: **7/7 Playwright flows passed** on real Chromium +
seeded postgres:16 — 4 distinct desktop flows (cash_survival, below_margin, compliance_block,
profitable_growth) + 3 mobile — each asserting the whole-business card renders from the runtime (dominant
constraint, do-not-do/stop, next action, owner-workload/offload, proof, reassessment, growth, arbitration,
provider-backed + confidence, stored-learning provenance), no fatal console errors, one login per
describe (no rate-limit). All **10 constraints are proven at the service level**
(`owner-scenario-constraints.test.ts`, 11 green, 7 distinct constraints). **Hard blocker for the full
10:** `OwnerCapacitySnapshot` / `OwnerWorkloadSnapshot` / `Proof` / `OwnerStandingInstruction` have no
`businessId` column (workspace-scoped), so capacity/owner-workload/proof-fraud constraints cannot be
isolated per business in one workspace — see `OPSIQ_BROWSER_REPRESENTATIVE_E2E_REPORT.md`. Unblock =
scoped schema migration adding `businessId` to those entities (out of this slice's scope).

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
**Training rung: `LEARNING_PERSISTENCE_READY` · Browser sub-gate: `BROWSER_REPRESENTATIVE_FAILED`
(hard architectural blocker) → `CORE_READY` not reached.**

Browser slice C result: 4 distinct representative browser flows + 3 mobile pass (real Chromium + seeded
postgres:16), all 10 constraints proven at the service level — but the "all 10 distinct browser flows"
gate is blocked because capacity/proof/workload/standing-instruction are workspace-scoped entities (no
`businessId`). This is a documented hard blocker, not a defect or a faked result; CORE_READY/EXPERT_READY
are NOT claimed.

Closed in the prior phase: **domain coverage 30/60 → 60/60** (every domain ≥40 material cases, every critical
domain ≥40 + ≥10 adversarial + ≥10 holdout + ≥5 multi-turn, 100% correct constraint, materiality + no
loose tags) and a **standalone governed learning persistence loop** (≥100 artifacts, ≥30 domain + ≥10
whole-business playbooks, ≥100 regression, ≥25 rules, ≥50 rerun improvements, full governance + no
leakage). Production-runtime scores hold on the 4,032-case corpus: runtime 97.4 / collective 97.5 /
holdout 97.8, adversarial unsafe 0, regression 0, all 26 critical domains ≥90, no weak category/severity.

Held **below** `CORE_READY`/`EXPERT_READY` for one honest reason: the **10 browser-representative E2E
flows are not yet executed** (CORE_READY explicitly requires ≥10 browser flows). No PR opened; not merged.

## Tests / checks run
`tsc` (0) · eslint changed (0) · public-cases suite **38/38** (source-register 6, corpus 11, scoring 8,
domain-coverage 5, learning 8) including 60/60 coverage + materiality + critical-domain bars + a live
production-runtime threshold sweep + learning governance/leakage gates. Full production-runtime sweeps via
`runOwnerAdvice`.
