# Full End-to-End Operations Audit — OpsIQ / Rebilix

Per journey: COMPLETE_PROVEN / PARTIAL / MISSING / BLOCKED / NOT_APPLICABLE.
"Proven" = exercised by a DB-backed test in the green suite or a runtime probe
this audit; "PARTIAL" = code path exists and reachable but not fully verified
end-to-end (e.g. no browser E2E run in this environment).

| # | Journey | Status | Note |
|---|---|---|---|
| 1 | Owner onboarding / workspace setup | COMPLETE_PROVEN | Signup creates user+workspace+owner membership (`auth/signup/route.ts`); covered by DB suite. |
| 2 | Business diagnosis | PARTIAL | `/api/run` + diagnosis orchestrator reachable + unit/DB tested; no browser E2E run here. |
| 3 | Business state creation/update | COMPLETE_PROVEN | BusinessConditionProfile / InterventionState models + services, DB-tested. |
| 4 | Wealth-path decision | COMPLETE_PROVEN | `/api/owner/wealth-path` + service DB-tested (`wealth-path.db.test.ts`); now UI-reachable. |
| 5 | Startup idea validation | PARTIAL | `/api/owner/startup-validate` (validation-first) reachable + unit-tested; now UI-reachable; not routed into governed re-eval. |
| 6 | Domain-specific recommendation | PARTIAL | Domain engines reachable + workspace-scoped; recommendation engine tested. |
| 7 | Next Best Move | COMPLETE_PROVEN | Command-center composer + priorities; DB-tested. |
| 8 | Work Package generation | COMPLETE_PROVEN | Work-package composer + task-assignment wires ProofRequirement + PENDING proof in one txn. |
| 9 | Staff assignment | COMPLETE_PROVEN | Task-assignment service, DB path. |
| 10 | Owner approval | COMPLETE_PROVEN | Approval workflow + owner proof-gate; high-impact approval now server-gated (GAP-FIN-01). |
| 11 | Proof submission | COMPLETE_PROVEN | Proof FSM submission validated vs requirement. |
| 12 | Proof validation | COMPLETE_PROVEN (delegated path) / BROKEN (legacy Evidence) | Proof FSM strong; legacy `validateEvidence` 500s (GAP-EVIDENCE-DRIFT-01). |
| 13 | Outcome measurement | COMPLETE_PROVEN | Outcome/KPI with baseline + review window; verification SoD. |
| 14 | Learning update | COMPLETE_PROVEN | Controlled-learning services with admission/harm/regression gates. |
| 15 | Dashboard reflection | PARTIAL | Owner surfaces render inputs+confidence; not browser-verified here. |
| 16 | Budget/capital guardrail | PARTIAL | Owner-budget path strong (gate+persist+audit+reassess); core `/api/run` guardrail impact/confidence only. |
| 17 | Compliance escalation | PARTIAL | Legal/jurisdiction boundary + abstention gates + tests; not exhaustively re-audited. |
| 18 | Fake-work attack | COMPLETE_PROVEN | Proof FSM blocks completion without accepted/fresh/non-duplicate proof; anti-gaming workflow. |
| 19 | Staff/manager bypass attack | PARTIAL | SoD enforced in proof/outcome paths; owner-override role confusion open (GAP-AUTHZ-01). |
| 20 | Cross-domain conflict | PARTIAL | Governed re-evaluation exists; wealth-loop next-best-move not reconciled with other engines (owner-mode deep-dive Finding 3). |
| 21 | Recovery from failed action | COMPLETE_PROVEN | Re-evaluation on failed implementation; idempotent retries. |
| 22 | Reassessment after poor outcome | COMPLETE_PROVEN | `triggerReEvaluation` on KPI deterioration / failed action. |
| 23 | Longitudinal review cycle | COMPLETE_PROVEN | Review-cycle service + cadence. |
| 24 | Owner workload reduction | COMPLETE_PROVEN | Workload-transfer scoring surfaced (now on the Wealth page). |
| 25 | Export/reporting | PARTIAL | Report generator + export routes exist; export tenancy hardened (GAP-TEN-02) except admin-billing decision (GAP-TEN-03). |

## Partial/missing critical owner journeys registered as gaps
- #12 legacy Evidence validation broken → GAP-EVIDENCE-DRIFT-01 (HIGH).
- #16/#20 core `/api/run` guardrail lacks runway check + wealth-loop reconciliation → tracked (owner-mode deep-dive; GAP notes).
- Browser E2E (#2, #15) not runnable in this container; owner-e2e workflows exist for a deployed URL.
