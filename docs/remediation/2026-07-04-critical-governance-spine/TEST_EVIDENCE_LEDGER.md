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

### SEC-02 / SEC-04 (Phase B)
- `vitest run sec-02-operator-cross-tenant-write.db.test.ts` → **5/5 PASS**.
- `vitest run sec-04-db-tenant-backstop.db.test.ts` → **4/4 PASS**.
- Regression: `vitest run owner-business-isolation.db + decision-transition-toctou.db + intervention-route.rbac` → **16/16 PASS**.
- `npx tsc --noEmit` after Phase A+B → **0 errors**.

### IDEM-01 (Phase C)
- `vitest run idem-01-durable-idempotency.db.test.ts` → **3/3 PASS**.
- Regression: action.test + api/actions.test + intervention-route.rbac + recommendation-business-impact.db → **223/223 PASS**.

### AUDIT-01 (Phase D)
- `vitest run audit-01-atomic-audit.db.test.ts` → **2/2 PASS** (forced audit failure rolls back mutation).
- `npx tsc --noEmit` after Phase D → **0 errors**.

### OUT-01 / OUT-02 (Phase E)
- `vitest run out-01-02-outcome-reeval.db.test.ts` → **3/3 PASS**.
- Regression: 15 outcome test files → **228/228 PASS**. tsc → 0 errors.
