# Audit Artifact Inventory

**Date:** 2026-07-04

## Before consolidation
- **595** Markdown files at the repository root, the overwhelming majority one-off audit narratives,
  verdicts, root-cause traces, falsification/overfitting trials, and proof reports accumulated across
  prior remediation passes.
- **8.2 MB** under `reports/` (readiness/shadow-read JSON + narrative), left in place (build/data inputs).

## Classification of root `.md`

| Class | Count | Action |
|-------|-------|--------|
| Project-essential (`README`, `CLAUDE`, `AGENTS`) | 3 | **KEEP at root** |
| Operational runbooks / checklists / incident guides / migration guides | ~10 | **KEEP at root** |
| Docs referenced by code or tests (asserted-present, read by fixtures) | (subset of above + a few reports) | **KEEP at root** |
| Obsolete audit narratives / verdicts / proofs / trials / traces | **575** | **ARCHIVED** → `docs/archive/2026-07-04-pre-owner-use-consolidation/` |

## After consolidation
- **20** `.md` remain at root (essential + operational + code-referenced).
- **575** moved via `git mv` into `docs/archive/2026-07-04-pre-owner-use-consolidation/` — full git
  history preserved, so traceability is intact (nothing deleted; `git log --follow` still works).

## Kept at root (the 20)
`AGENTS.md`, `AUTH_ADVERSARIAL_REPORT.md`, `CLAUDE.md`, `DB_MIGRATION_ENVIRONMENT_GUIDE.md`,
`GUIDED_EXECUTION_BUILD_STATE.md`, `MODULE13_REAL_BUSINESS_VALIDATION_RUNBOOK.md`,
`MODULE2_SLICE0_SCHEMA_DECISION_NOTE.md`, `MODULE_1_EXTERNAL_MIGRATION_RUNBOOK.md`,
`OPSIQ_BEHAVIORAL_VALIDATION_EXPERT_TRAINING_REPORT.md`, `OWNER_MODE_GUIDED_EXECUTION_FINAL_REPORT.md`,
`OWNER_MODE_INCIDENT_RESPONSE.md`, `OWNER_MODE_REAL_BUSINESS_PILOT_CHECKLIST.md`,
`OWNER_RECOVERY_RUNTIME_PROOF_REPORT.md`, `P2B_DB_EXECUTION_CHECKLIST.md`, `README.md`,
`READ_ROUTES_PATCH_GUIDE.md`, `ROUND_2_BENCHMARK_ENRICHMENT_SPEC.md`, `SERVICE_LAYER_AUTH_GUIDE.md`,
`execution.md`, `execution_post_owner_mode.md`.

## Selection rule (safety)
A file was archived only if it was **not** in the project-essential/operational keep-list **and not**
referenced by any file under `src/`, `scripts/`, `.github/`, or build config. This guarantees the move
cannot break the build or any test that reads a doc by path — verified: the doc-referencing tests
(`deployment-readiness`, `backup-restore`, `reassessment-cadence`) still pass (72/72) and no referenced
doc was moved.
