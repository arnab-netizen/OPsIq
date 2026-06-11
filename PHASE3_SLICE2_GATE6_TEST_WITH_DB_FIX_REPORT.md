# Phase 3 Slice 2 — Gate 6 TEST_WITH_DB Fix Report

Date: 2026-06-11
Branch: `claude/vibrant-ramanujan-mdqej8`
PR: #31 (head was `f4f4794` before this change)

## 1. Root cause

The workflow `.github/workflows/phase-3-slice-2-truth-pass.yml` runs at **Gate 6**:

```
npm test -- --run src/__tests__/phase-3-event-emitter-integration.test.ts
```

Vitest reported **"No test files found, exiting with code 1"**. Reason:
`vitest.config.ts` excludes `**/phase-*.test.ts` (and filters out `[db]` tests)
**unless** `TEST_WITH_DB === "true"`:

```ts
const testWithDb = process.env.TEST_WITH_DB === "true";
...
...(testWithDb ? [] : [ "**/phase-*.test.ts" ])   // excluded when TEST_WITH_DB != true
```

The Phase 3 Slice 2 workflow never set `TEST_WITH_DB`, so the targeted phase
integration test matched the exclude pattern, Vitest found no files, and the gate
exited 1.

## 2. Why Gate 6 was previously masked by Gate 2

Before the env-override fix (`f4f4794`), **Gate 2 (`npx prisma migrate deploy`)**
failed first with `P1001` (the committed `.env.local` placeholder overrode the CI
`DATABASE_URL`). The workflow stopped at Gate 2, so Gate 6 never executed and its
defect was invisible. Once Gate 2 was fixed and the workflow proceeded, Gate 6 ran
and surfaced this pre-existing test-exclusion bug.

## 3. Workflow file changed

`.github/workflows/phase-3-slice-2-truth-pass.yml` — only the Gate 6 step (added a
step-scoped `env`). No other file touched.

## 4. Exact fix

```yaml
      - name: 'Gate 6: Unit tests'
        env:
          TEST_WITH_DB: 'true'
        run: npm test -- --run src/__tests__/phase-3-event-emitter-integration.test.ts
        continue-on-error: false
```

Step-scoped (not job-level) because only this step runs Vitest; other gates
(validate/migrate/tsc/build/lint) do not depend on `TEST_WITH_DB`. With it set,
Vitest no longer excludes `**/phase-*.test.ts`, no longer applies the `[db]`
name filter, and `vitest-global-setup` initializes the DB connection against the
CI Postgres service (already migrated by Gate 2, host
`postgresql://test:test@localhost:5432/opsiq_test`).

## 5. Why this strengthens the gate (does not weaken it)

Previously the integration test was **silently not executed** ("No test files
found") — the gate was failing precisely because its DB-backed test never ran. The
fix makes the real `phase-3-event-emitter-integration.test.ts` (EventEmitterService
contract, append-only enforcement, idempotency) actually execute against a real
database. This is the opposite of weakening: the gate now genuinely verifies the
behavior it was meant to. The test is not deleted, skipped, or modified; no product
code changed; the gate's `continue-on-error: false` is preserved.

## 6. Commands run and results

| Command | Result |
|---|---|
| YAML parse (`yaml.safe_load`) | YAML OK |
| `git diff --check` | clean (exit 0) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 errors) |
| `npx prisma validate` | valid 🚀 |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` | 193 files passed, 15 skipped, 0 failed; 5473 tests passed |
| `npm run build` | Compiled successfully |

The phase-3 DB integration test is exercised by CI Gate 6 (with the CI Postgres
service); it was not run locally because verifying it would require applying the
migration chain to a local database — out of scope under the hard rules (no local
migration / no Module 1 migration run). CI validates Gate 6 after push.

## 7. No secrets printed or committed

Confirmed — the change adds only `TEST_WITH_DB: 'true'`; no URLs/credentials. The
only DB strings in this workflow are the public CI dummy `test:test@localhost` and
`REPLACE_*` placeholders, neither a real secret. Staged-diff secret scan performed.

## 8. No `.env*` files modified

Confirmed — no `.env`, `.env.local`, `.env.test`, etc. edited or staged.

## 9. No migration run manually

Confirmed — no `prisma migrate deploy`/`reset`/`db push` run locally or against any
real database.

## 10. Owner Recovery Module 1 unaffected

Confirmed — no Module 1 code, schema, migration SQL, routes, services, or tests
changed; founder-recovery suite green; build green.

## 11. Module 2 remains blocked

Confirmed — no Module 2 work.

## 12. Public/SaaS remains frozen

Confirmed — no public/SaaS/billing/marketing files touched.
