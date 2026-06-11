# Ops Endpoints Auth Test Harness Fix Report

Date: 2026-06-11
Branch: `claude/vibrant-ramanujan-mdqej8`

## 1. Root cause

`src/__tests__/security/ops-endpoints-auth.test.ts` was a **live-HTTP integration
test**: every assertion called `fetch("http://localhost:3000/api/ops/...")`. Under
plain `npm test` (vitest, `TEST_WITH_DB=false`, `NODE_ENV=test`) no Next server is
started, so all 16 requests failed with `TypeError: fetch failed` /
`ECONNREFUSED 127.0.0.1:3000` (and `::1:3000`). The CI test job does not (and should
not need to) start a server, so the file failed deterministically — not a security
regression, a harness mismatch.

- Intended as a live HTTP integration test? **Yes** (original used `fetch` to a
  localhost server).
- Any existing test helper that starts the Next server? **No** in-process bootstrap
  for unit tests; servers were only started ad hoc.
- Existing integration-test script that starts the server? **No** dedicated
  server-starting `npm` script feeds this file.
- Can it be converted to deterministic in-process tests? **Yes** — the repo already
  has the pattern (e.g. `src/__tests__/api/actions-error-handling.test.ts`): import
  the route handler and call it with a constructed `NextRequest`.
- Should CI start a server for this file? **Not necessary** — the security contract
  is fully exercised in-process.

## 2. Fix chosen

**Option A — convert to deterministic in-process route-handler tests.**

The test now imports the real `GET` handlers from `@/app/api/ops/{errors,metrics,
readiness,runtime}/route` and invokes them with `new NextRequest(...)`. The auth
gate (`verifyDiagnosticKeyFromRequest`) runs first in every handler, so the contract
is verified without a live server and without a real database:

- **Missing key →** `404` + body `{ error: "Unauthorized" }`
- **Valid key (header) →** status `!= 404` (auth gate lets the request through)
- **Valid key (query param) →** status `!= 404`
- **Invalid key (`wrong-key-123`) →** `404` + `{ error: "Unauthorized" }`

`OPSIQ_DIAGNOSTIC_KEY` is set to a known value (`test-key`) in `beforeAll` and
restored in `afterAll`, making the "valid key" path deterministic. The same 16
test cases (4 endpoints × 4 scenarios) and the same assertions are preserved — no
coverage was removed, no test skipped, the file was not deleted. The `readiness`
valid-key path touches the DB; when no DB is reachable its `try/catch` returns 500,
which still satisfies `status != 404`, so the test stays deterministic with
`TEST_WITH_DB=false`.

## 3. Files changed

- `src/__tests__/security/ops-endpoints-auth.test.ts` — converted from live `fetch`
  to in-process handler invocation. **Only this file changed.** No product code, no
  CI workflow, no Owner Recovery code, no config.

## 4. Commands run

```
git status --short
npx vitest run src/__tests__/security/ops-endpoints-auth.test.ts
npm test
npx prisma validate
npm run build
npx vitest run src/__tests__/founder-recovery/
```
(Task referenced `src/tests/...` and `npm test -- <file>`; the real path is
`src/__tests__/...` and the file was run via `npx vitest run <file>`.)

## 5. Passing / failing results

| Command | Result |
|---|---|
| `npx vitest run .../ops-endpoints-auth.test.ts` | **16 passed** (1 file), no server |
| `npm test` (full) | **193 files passed, 15 skipped, 0 failed; 5467 tests passed, 159 skipped** |
| `npx prisma validate` | valid 🚀 |
| `npm run build` | Compiled successfully (9 owner/recovery routes) |
| `npx vitest run src/__tests__/founder-recovery/` | 8 passed, 1 skipped; 38 passed, 8 skipped |

Previously: 1 failed file / 16 failed tests. Now: **0 failed**.

## 6. Security coverage preserved?

**Yes.** All four scenarios (no key, valid-header, valid-query, invalid key) across
all four `/api/ops/*` endpoints are still asserted, now against the real handlers
in-process. The "reject without/with-invalid key → 404 Unauthorized" guarantees are
intact; nothing was skipped or stubbed.

Observation (not changed — out of scope, not required for the harness fix): the
shared validator `src/lib/security/diagnostic-key.ts` `verifyDiagnosticKey()` returns
`true` for any **same-length** key because the equal-length branch ignores the
`timingSafeEqual` return value (`timingSafeEqual(...); return true;`). The existing
invalid-key test (`wrong-key-123`, length 13 vs `test-key`, length 8) is rejected via
the length-mismatch path, so coverage is honest for that case, but a same-length
wrong key would be wrongly accepted. This is a latent product-security bug to fix
separately; this task did not modify product logic.

## 7. Was Owner Recovery Module 1 affected?

**No.** No Owner Recovery code, migration, route, service, or test was touched.
`npx vitest run src/__tests__/founder-recovery/` and the build remain green.

## 8. Can Module 2 start?

**NO.** Module 1 is still not migrated to a real/staging DB nor staging-cycle proven;
the gate remains closed.

## 9. Can public/SaaS resume?

**NO.** Frozen until Module 1 is deployed and at least staging-proven.
