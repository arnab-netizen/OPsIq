# Test Evidence Ledger — Full-Repo Commercial Reliability Hostile Audit

Environment: Node v22.22.2, npm 10.9.7. Local PostgreSQL 16 started for
DB-backed tests (`opsiq_test`), all 99 migrations applied. A live Neon DB is
configured in the container env but was NOT used for tests (to avoid mutation).

| # | Command | Result |
|---|---|---|
| 1 | `npx tsc --noEmit` (base, and after each fix) | PASS — clean across ~2,500 files |
| 2 | `npm run governance:scan:auth` | PASS — all routes comply (before + after fixes) |
| 3 | `npm run governance:scan:strict` | PASS — 0 NEW; 32 frozen baseline findings |
| 4 | `npm run audit:wrapped-handlers:ratchet` | PASS — 29 baseline, 0 new |
| 5 | Full DB-backed suite on base (`vitest run --maxWorkers 2` + quarantine excludes, `TEST_WITH_DB=true`) | PASS — **802 files / 13,978 tests pass**, 1+13 skipped, 715s |
| 6 | `vitest run src/services/auth/__tests__/approval-grant.test.ts` | PASS — 5/5 (GAP-FIN-01) |
| 7 | `vitest run src/__tests__/security/cross-tenant-workspace-header.test.ts` | PASS — 8/8 (GAP-TEN-02) |
| 8 | `vitest run src/__tests__/owner-mode/wealth-command-center-wiring.test.ts` | PASS — 3/3 (GAP-WIRE-01) |
| 9 | `vitest run admin/billing-route + webhooks + services/business-impact` | PASS — 72/72 (no regression from GAP-TEN-02) |
| 10 | Runtime probe: Prisma middleware model-arg casing | CONFIRMED inert — model passed PascalCase; `.has(camelCase)` never matches (GAP-TEN-01) |
| 11 | Blast-radius test: casing fix applied, sample of 18 `*.db.test.ts` | 5 files / 15 tests FAIL (incl. `create User`, `deleteMany AuditEvent`) → enabling breaks prod signup → reverted (GAP-TEN-01) |
| 12 | Runtime probe: `db.evidence.findUnique({where:{id, workspaceId}})` via app `@/lib/db` | CONFIRMED throws `Invalid prisma.evidence.findUnique() invocation` — no workspaceId column (GAP-EVIDENCE-DRIFT-01) |
| 13 | Full DB-backed regression suite AFTER committed source fixes (guardrails, run route, access, 6 tenancy routes) | _PENDING — see below_ |
| 14 | `eslint` on new/changed files | PASS (after matching the owner-page rule-disable convention) |

## Regression run (item 13) — result
_(Filled in after the post-fix full-suite run completes; see commit updating this file.)_

## Notes
- The blocking CI lane (`ci.yml`) mirrors item 5 (full DB-backed suite, quarantine excluded) plus governance/tsc/build/ratchet gates, on push to main/claude/** and PRs to main.
- Quarantined `security/*` suites were re-run in isolation during the audit: `diagnostic-key-validation` 17 pass, `ops-endpoints-auth` 20 pass — the quarantine is harness/DB-lane noise, not a hidden hole (GAP-TEST-01).
