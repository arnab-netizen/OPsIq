# OpsIQ Remediation — Test Evidence Ledger

Every command run + result. DB commands use local PostgreSQL (opsiq_test, /tmp socket).

## Environment
- `npx prisma migrate deploy` → All 99 migrations applied to local opsiq_test. PASS.
- `npx prisma validate` → schema valid. PASS.
- `npx tsc --noEmit` (pre-remediation baseline) → 0 errors. PASS.
- Smoke: `vitest run src/__tests__/services/owner-mode/owner-business-isolation.db.test.ts` (TEST_WITH_DB=true) → 6/6 PASS.

## Per-fix evidence
(appended as fixes land)

### SEC-01
- `vitest run src/__tests__/security/sec-01-resolve-server-role.test.ts` (TEST_WITH_DB=true) → **7/7 PASS**.
