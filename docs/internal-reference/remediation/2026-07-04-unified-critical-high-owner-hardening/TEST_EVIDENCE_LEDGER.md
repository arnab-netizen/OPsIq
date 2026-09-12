# Unified Test Evidence Ledger

Env: local PostgreSQL (opsiq_test, /tmp socket), TEST_WITH_DB=true, 99 migrations applied. `npx tsc --noEmit` → 0 errors throughout.

## New/ported DB-backed tests (this unified branch)
- Reconciliation ported: evidence-repair.db + operator-override.db + admin/billing-route → **27/27 PASS**.
- My security suite (`src/__tests__/security/`) incl. new audit-02-additems-atomic.db → all green.
- audit-02-additems-atomic.db.test.ts → **2/2** (persists correct columns; rolls back on audit failure).
- Regression (operator/override/evidence/store) → **467 passed / 5 skipped**.
- Reconciliation smoke (sec-02 + audit-01 + audit-02) → **9/9**.

## DB proof status
Local postgres only (env Neon unreachable — BLOCKED_EXTERNAL for the managed DB). CI postgres blocking lane is the authoritative gate. Full 808-file suite NOT re-run this session (sharded verification used); not claimed as full-green.

## Browser/E2E
UI_E2E_UNPROVEN — no app server in harness (see UI_E2E_PROOF_OR_BLOCKER_REPORT.md).
