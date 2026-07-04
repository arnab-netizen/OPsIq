# Supportability & Operability Audit

| Area | Rating | Evidence / note |
|---|---|---|
| Support tooling | ADEQUATE | `scripts/support-diagnostics.mjs`, `scripts/smoke-tests.ts`, admin billing diagnostics (workspace-scoped). |
| Structured logging | ADEQUATE | `createEventLogger`, `src/infra/logger`; observability loggers per route. |
| Correlation IDs | PARTIAL | `correlationId` supported by `emitAuditEvent`/loggers but not uniformly threaded (CM-SUP-02). Criteria: correlation id on every governed mutation + surfaced in diagnostics. |
| Error messages | ADEQUATE | Operator-error governance sanitizes; avoids raw DB error leaks (route wrapper classifies). |
| Audit-trail explains "what happened" | ADEQUATE | Hash-chained audit; override + blocked-decision now transactional (fail-closed); addItems/updateItem best-effort (GAP-AUDIT-02). |
| Incident recovery | ADEQUATE | Idempotency re-read; optimistic-lock conflict → reload-and-retry; proof compare-and-swap. |
| Failed-job reconciliation | ADEQUATE(proof) / OPEN(audit) | Proof/idempotency reconcile; audit retry/outbox is the GAP-AUDIT-02 option (register). |
| Admin/debug safety | ADEQUATE | Admin routes SYSTEM_ADMIN + workspace-verified; internal diagnostics behind diagnostic-key/bearer. |
| Runbooks | ADEQUATE | `docs/OPERATIONAL_RUNBOOK.md`, `docs/INCIDENT_RESPONSE_GUIDE.md`, `docs/DEPLOYMENT_RUNBOOK.md`. |

## Support-burden risks (registered)
- Silent-degradation class (evidence → "0 evidence") — **fixed** this slice (GAP-EVIDENCE-DRIFT-01), removing a class of "why is my data missing" tickets.
- Evidence bundles currently unavailable (governed error) until DEC-EVID-01 — a known, documented limitation, not a crash.
- Best-effort audit on 2 remaining operator paths (GAP-AUDIT-02) could complicate forensic support — MEDIUM, registered.

## Verdict
ADEQUATE for a supervised pilot. The correlation-id threading and the two
remaining best-effort audit paths are the main supportability follow-ups; both
are registered with criteria and neither blocks Owner Mode.
