# OpsIQ Public-Corpus Learning Persistence — Report

Standalone governed learning loop over the public real-world corpus (`runPublicLearningLoop`). Failures
(surfaced by a deliberately weak advisor) are turned into governed correction artifacts + regression
cases via the validated learning engine, persisted to the governed store, with playbooks/rules
regenerated and the corrected advisor proven to improve — without weakening any scorer or gate.

## Measured (cross-corpus sample, 432 cases)
| Metric | Value | Target |
|---|---|---|
| Cases processed (non-holdout) | 432 | — |
| Learning artifacts persisted | **432** | ≥100 |
| Domain playbooks created/updated | **60** | ≥30 |
| Whole-business playbooks created/updated | **28** | ≥10 |
| Regression cases generated | **432** | ≥100 |
| Do-not-repeat rules | **191** | (≥25 combined) |
| Caution rules | 6 | — |
| Proof rules | 28 | — |
| Owner-workload offload rules | 50 | — |
| Rerun-improvement proofs | **432** | ≥50 |

## Governance (all enforced + tested)
- **Scope-limited:** every artifact carries an applicability scope (archetype/decision-category/location) — `true`.
- **Workspace-private + local_only + pending:** no automatic global promotion — `true`; `promoteToGlobal` on a pending artifact throws.
- **No holdout leakage:** learning runs only on training/regression/validation splits, never holdout — `true`.
- **No cross-workspace leakage:** a second workspace sees none of the workspace-private artifacts — `true`.
- **No source-text/PII leakage:** artifact text passes the PII + long-copied-text gates — `true`.
- **Provenance:** the corrected advisor reads the store and applies in-scope artifacts (advice improves vs the weak advisor for the owning workspace only).

## Tests
`learning.test.ts` — 8 tests: ≥100 artifacts, ≥30 domain + ≥10 whole-business playbooks, ≥100 regression
+ ≥25 rules, ≥50 rerun improvements, scope-limit + local/pending, no holdout/cross-workspace/source-text
leakage, global-promotion-blocked, and artifact-improves-output-in-owning-workspace-only. All green.

## Note on DB persistence
The loop uses the governed `InMemoryLearningStore` (same `LearningStore` governance contract). Real DB
persistence via `PrismaLearningStore` is already proven by the `[db]`-gated tests merged on `main`
(PR #57); a public-corpus `[db]` persistence variant can be added but is not required for the governance
gates proven here.
