# Security & Enterprise Credibility Audit

| Area | Rating | Evidence / note |
|---|---|---|
| Auth on routes | STRONG | `governance:scan:auth` green; every route wrapped; 317 API routes. |
| Capability gates | STRONG | Server-side `requireCapabilities` in the canonical wrapper; internal-only capabilities blocked for client roles. |
| Tenant isolation (route) | STRONG | `ctx.verifiedWorkspaceId` (membership-derived, never header); deviating routes closed (GAP-TEN-02/03 this slice). |
| Tenant isolation (DB) | ADEQUATE | Curated backstop live (GAP-TEN-01); grow per classification doc. |
| Override / privileged actions | STRONG | Governed override (server gate + capability + acknowledgement + durable + hash-chained audit) — GAP-OVR-01. |
| Webhook/signature | ADEQUATE | Webhook subscribe/test now membership-verified (GAP-TEN-02); signature verify on write path is a hardening item (CM-SEC-03). |
| Error leakage | ADEQUATE | Operator-error governance sanitizes; 32 frozen raw-`error.message` findings ratcheted (CM-SEC-02) — burn down before enterprise sale. |
| Role separation | STRONG | Role hierarchy + SoD in proof/evidence/outcome paths; `system_admin` confirmed workspace-scoped. |
| Secrets/logs | ADEQUATE | No hardcoded secrets in audited routes; diagnostic-key/bearer gating on internal routes. |
| Rate limiting | ADEQUATE | Per-workspace rate limit on `/api/run`. |
| Audit tamper-resistance | ADEQUATE | Hash-chained audit; high-risk paths now transactional; hash-chain fork race is a LOW hardening item. |

## Top residuals (registered, non-blocking for Owner Mode)
- CM-SEC-02 (MED): 32 frozen error-governance findings — burn down.
- CM-SEC-03 (LOW): asymmetric signature not verified on write path.
- Audit hash-chain concurrency fork (LOW).

## Verdict
STRONG for Owner Mode; enterprise-adequate. The live cross-tenant risks from the
prior audit are closed; remaining items are hardening/hygiene, not exploitable
holes proven in code.
