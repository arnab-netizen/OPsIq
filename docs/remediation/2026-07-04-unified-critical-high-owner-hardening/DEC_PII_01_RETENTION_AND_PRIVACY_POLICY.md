# DEC-PII-01 — PII / Retention / Privacy Policy

## Source verification
- No formal data-classification/retention policy in repo. Audit events are hash-chained + retained (integrity). AI ledger / error logs exist. Deletion/export capabilities: not found as governed endpoints.
- Existing secret-safety: error sanitization via canonical wrapper (operator-error-governance); some secret-scrub tests exist.

## Decision (policy contract — implementation partial)
- PII = user email/name, client/lead contact data. Business-confidential = financials/decisions. Operational evidence = proof artifacts. Audit-retained = auditEvent (must NOT be deletable — integrity).
- Retention: audit/proof retained for integrity; PII deletable on workspace/user deletion (not yet implemented as governed flow).
- Guardrail added scope this session: none new (secret-safety already present; no new sanitization added).

## Status
- **DEC-PII-01: BLOCKED_OWNER_DECISION_REQUIRED.** Deletion/export/retention enforcement is **NOT implemented**.
- **PII_PUBLIC_SAAS_STATUS: NOT_READY** — do not claim privacy readiness. Required future work: workspace/user deletion + data export endpoints, retention jobs, PII-in-audit minimization, DPA/legal review.
