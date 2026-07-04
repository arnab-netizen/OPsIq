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
| 13 | Full DB-backed regression suite AFTER committed source fixes (guardrails, run route, access, 6 tenancy routes) | 804 files pass / **1 file failed** = `admin-operability-db.test.ts` (`memberCount` assertion) |
| 13a | Root-cause of the 1 failure: reset schema → `prisma migrate deploy` → run that test once on a CLEAN DB | PASS — 11/11 |
| 14 | `eslint` on new/changed files | PASS (after matching the owner-page rule-disable convention) |
| 15 | Final clean full-suite run on a freshly-reset DB (no intervening probes) | See "Final regression run" below |

## Regression run (item 13) — result
The single failure (`admin-operability-db.test.ts > lists created workspaces with
correct active member counts`) is **NOT a code regression**. It is a
test-isolation defect in that test: its `beforeAll` fixtures are not idempotent
across runs, so re-running it against a **persistent** DB accumulates
memberships and the `memberCount).toBe(2)` assertion fails. It passed in the
fresh-DB base run (item 5) and passes again after a schema reset (item 13a). It
only surfaced here because the audit ran runtime probes + a blast-radius sample
suite (items 10–12) against the shared `opsiq_test` DB before the regression
run, polluting it. In CI this never manifests — `ci.yml` provisions a fresh
`postgres:16` service container per run. Registered as **GAP-TEST-02 (LOW)**.

None of the committed source changes (guardrails threshold const, run-route
approval gating, `access.ts`, the 6 tenancy routes, the wealth page, the
middleware comment) touch workspace listing or member counts.

## Final regression run (item 15) — result
On a freshly-reset `opsiq_test` DB (schema drop + `prisma migrate deploy`, no
intervening probes), the full DB-backed suite with all committed audit changes:
**805 files passed | 1 skipped (806); 13,994 tests passed | 13 skipped; EXIT 0.**
Zero failures. This confirms the committed fixes (GAP-FIN-01, GAP-TEN-02,
GAP-WIRE-01, and the GAP-TEN-01 doc comment) introduce no regressions, and that
item 13's lone failure was purely DB pollution from the audit's own probes.

## Notes
- The blocking CI lane (`ci.yml`) mirrors item 5 (full DB-backed suite, quarantine excluded) plus governance/tsc/build/ratchet gates, on push to main/claude/** and PRs to main.
- Quarantined `security/*` suites were re-run in isolation during the audit: `diagnostic-key-validation` 17 pass, `ops-endpoints-auth` 20 pass — the quarantine is harness/DB-lane noise, not a hidden hole (GAP-TEST-01).
