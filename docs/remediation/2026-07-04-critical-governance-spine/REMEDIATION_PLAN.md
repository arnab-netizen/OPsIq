# OpsIQ Critical Governance-Spine Remediation Plan

**Branch:** `claude/critical-governance-spine-remediation`
**Base main:** `98762ba` · **Audit commit:** `626052e`
**DB availability:** local PostgreSQL 16 provisioned in-session (opsiq_test, 99 migrations applied); the environment's Neon DATABASE_URL is unreachable (network policy blocks non-HTTPS egress). DB-backed test tier verified green (owner-business-isolation.db 6/6).
**Package manager:** npm 10.9.7 / node 22.
**CI visibility:** `.github/workflows/*` (ci.yml required gate runs TEST_WITH_DB=true on a real Postgres).

## Dependency order (fix, don't document)
A. SEC-01 always-admin authorization root
B. SEC-02 cross-tenant operator write · SEC-04/GAP-TEN-01 inert DB backstop · workspace scoping
C. IDEM-01 no-op idempotency
D. AUDIT-01 fail-open audit
E. OUT-01/OUT-02 fabricated outcomes + missing outcome→re-eval wiring
F. BILL-01 x-tier trust
G. DEC-01 re-accept hole · GAME-01 owner-nullable freshness gate
H. SCHEMA-01/02/03 drift & entity collapse
I. UI-01/UI-02 blank dashboard / cosmetic inbox / stubs
J. TEST-02/TEST-04 quarantined scanner + fake tests + CI signal
K. Remaining HIGH · L. MEDIUM/LOW

## Method per finding
Verify from source → write failing regression test (where practical) → minimum fix → re-run test → re-run shard → ledger update → commit. No closure without a test that fails before and passes after, or direct source disproof.

## Honesty constraints
- No CRITICAL/HIGH deferred as low-risk.
- Do not count fake/quarantined tests as readiness proof.
- No public-SaaS / billing-launch / marketing work.
- DB proof only claimed when actually executed against the local Postgres.
