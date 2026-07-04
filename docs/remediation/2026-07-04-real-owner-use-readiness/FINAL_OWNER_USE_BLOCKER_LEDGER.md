# Final Owner-Use Blocker Ledger

**Date:** 2026-07-04 · **Branch:** `claude/opsiq-hostile-audit-jye6h4` · **HEAD:** `af33f8c1`

Status legend: **CLOSED_PROVEN** (source + passing DB/route/service tests) ·
**SAFELY_DISABLED** (fail-closed, proven) · **FINALIZED** (decision documented) ·
**CLASSIFIED** (scoped, not an owner-tomorrow blocker) · **DEFER** (pilot/SaaS hardening).

| ID | Title | Status | Evidence |
|----|-------|--------|----------|
| AUDIT-01 | Remaining audit paths (reject / lifecycle-transition / outcome-verify) must be atomic | **CLOSED_PROVEN** | Commit `18a7005c`. `decision-acceptance.service.ts`, `decision-lifecycle.service.ts`, `verification-approval.service.ts` now emit the audit event inside the same `$transaction` as the guarded `updateMany`; a forced audit failure rolls the state change back. Test: `src/__tests__/security/audit-01-remaining-paths.db.test.ts`. |
| DEC-EVID-01 | Evidence bundles as a parallel/competing proof truth | **SAFELY_DISABLED** | Commit `01a86406`. Bundles group `EvidenceItem` — a model divorced from the canonical `Evidence` proof pipeline; no proof/verification/recommendation path reads `EvidenceBundle`; the subsystem carried irreconcilable schema drift and never functioned. All six bundle entry points fail closed at one service-layer chokepoint with `FeatureDisabledError` (501). Test: `src/__tests__/security/dec-evid-01-bundle-isolation.db.test.ts`. |
| EVID-01 | Tamper/relevance precheck; weak evidence must not count as verified | **CLOSED_PROVEN** | Commit `c666ea4d`. `runProofPrecheck` (previously zero callers) wired into `intakeProofSubmission`; deterministic signals (real duplicate hashes + `detectProofArtifactSignals` artifact integrity). Precheck is SYSTEM-only and can never reach ACCEPTED; completion clears only on ACCEPTED. Tests: `proof-intake.service.db.test.ts`, `domain/execution/proof-precheck.test.ts`. |
| REEVAL-01 | Mandatory adaptive triggers wired to real callers | **CLOSED_PROVEN** | Commits `43a3e75b`, `9a367391`. All 9 `SignificantChangeType` triggers have real callers: `owner_non_compliance` (escalation), `major_client_loss` (client archive), `kpi_deterioration`, + the 6 pre-existing. Tests: `reeval-01-remaining-triggers.db.test.ts` and the real-business simulation. |
| DEC-TEN-01 (ClientAccount / LeadRecord) | Workspace anchor finalization | **FINALIZED** | Commits `f5d805ca`, `43a3e75b`. Nullable transitional `workspaceId` added to both models with an index; services write and filter by workspace (fail-closed on absence). Decision: `OWNER_DATA_SAFE_BY_SERVICE_FAIL_CLOSED` — see `EVIDENCE_BUNDLE_AND_PRECHECK_CLOSURE.md` §Tenancy and `CURRENT_OPSIQ_STATUS.md`. |
| UI / browser E2E | Owner-mode UI actually renders/serves | **CLOSED_PROVEN (compile + smoke)** | Production `next build` succeeds (all `/owner/*` pages + API routes compile). Real Chromium smoke: `/login` (200, 2 inputs) and `/signup` (200, 3 inputs) render. Residual gap (auth-gated click-through) documented in `UI_E2E_PROOF_OR_BLOCKER_REPORT.md`. |
| CM-SEC-02 | Owner-use route raw-error leaks | **CLOSED_PROVEN** | Commit `f9656235`. `auth/signup` no longer throws raw `error.message` to public callers; all other non-internal routes return governed `operatorMessage` / `AppError.code`. Scan documented in the report. |
| SCHEMA-02 | 82 `onDelete: Cascade` incl. governed records, no audit | **DEFER (SaaS)** | Not a solo-owner-tomorrow blocker; cascades only fire on owner-initiated parent deletes. Operational caveat: do not hard-delete workspaces/engagements. |
| APPR-01 | >100k approval workflow enforced on one route only | **CLASSIFIED (pilot)** | Owner is the sole approver in solo mode. Becomes relevant when delegating high-value financial actions to staff; verify the specific route enforces approval before that. |
| AI-01 | "Canned advice engine" on `/api/diagnosis` | **CLASSIFIED (not owner-blocker)** | The route runs a deterministic multi-engine orchestrator (`DiagnosisOrchestrator` + `FinancialEngine` + personalization) grounded in the owner's own inputs — not fabricated-from-nothing. Dedup of the two recommendation paths is SaaS hygiene. |
| AI-02 | Abstention/safety gate is dead code | **DEFER (SaaS)** | The current owner loop is deterministic (rules engine) and human-gated (proof review/completion). The abstention gate matters once LLM proposals enter the write path. |

## Not in scope (explicitly deferred to pilot/SaaS)
BILL-*, WEBHOOK-*, SCHEMA-01/03/04, APPR-02, AI-03, UI-03, STUB-*, TEST-01/03/04, AUDIT-02-arch,
SEC-05/06 — none block a single owner running their own business on private owner mode.
