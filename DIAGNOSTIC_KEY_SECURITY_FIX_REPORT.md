# Diagnostic Key Security Fix Report

Date: 2026-06-11
Branch: `claude/vibrant-ramanujan-mdqej8`

## 1. Root cause

`src/lib/security/diagnostic-key.ts` → `verifyDiagnosticKey()` accepted **any
same-length key**. The equal-length branch invoked the timing-safe comparison but
**ignored its boolean result** and unconditionally returned `true`:

```ts
// BEFORE (buggy)
try {
  timingSafeEqual(expectedBuffer, providedBuffer);
  return true;   // <-- always true for equal-length inputs
} catch {
  return false;
}
```

`crypto.timingSafeEqual(a, b)` returns `true`/`false` for equal-length buffers and
only **throws** when the lengths differ. Because this branch is reached only when
lengths are already equal, `timingSafeEqual` never threw, so the function always
returned `true`. Net effect: a wrong key of the same byte-length as the real
`OPSIQ_DIAGNOSTIC_KEY` was accepted.

- **Why same-length wrong keys passed:** the comparison result was discarded.
- **Affected endpoints:** every consumer of `verifyDiagnosticKey` /
  `verifyDiagnosticKeyFromRequest` — `/api/ops/errors`, `/api/ops/metrics`,
  `/api/ops/readiness`, `/api/ops/runtime`, plus the diagnostic-key gated extra-info
  branches in `/api/diagnosis`, `/api/auth/signup`, and the `/api/internal/*` proof
  routes. (Different-length wrong keys were always rejected via the length-mismatch
  branch, which limited real-world exploitability but did not eliminate it.)
- **Which tests failed to catch it:** `src/__tests__/security/diagnostic-key-validation.test.ts`
  only used wrong keys of a **different length** ("wrong-key", "test-key-short",
  unicode of different byte-length), so they hit the (correct) length-mismatch path.
  The in-process ops test used `wrong-key-123` (len 13) vs `test-key` (len 8) — also
  different length. No test exercised a **same-length wrong key**, so the bug was
  invisible.

## 2. Minimal safe fix

Honor the comparison result in the equal-length branch:

```ts
// AFTER (fixed)
// Same length: use standard timing-safe comparison and HONOR its result.
return timingSafeEqual(expectedBuffer, providedBuffer);
```

Timing-safety is preserved (`timingSafeEqual` is constant-time for equal-length
buffers). The length-mismatch branch was already correct (always returns `false`)
and was left unchanged. No raw key is logged anywhere.

Required behaviors, all now satisfied: missing → false, empty → false, wrong shorter
→ false, wrong longer → false, **wrong same-length → false**, exact correct → true.

## 3. Files changed

- `src/lib/security/diagnostic-key.ts` — fixed the equal-length branch (1 logic change).
- `src/__tests__/security/diagnostic-key-validation.test.ts` — added unit tests for a
  fully-wrong same-length key and a one-byte-different same-length key.
- `src/__tests__/security/ops-endpoints-auth.test.ts` — added an in-process route
  block asserting a same-length wrong key is rejected with `404 Unauthorized` across
  all four `/api/ops/*` endpoints (renamed the existing block to "different length").

No product code beyond the security validator was touched. No workflows, env files,
secrets, Owner Recovery code, public/SaaS, billing, or marketing.

## 4. Tests added / updated

- Unit (`diagnostic-key-validation.test.ts`): +2 — same-length fully-wrong key → false;
  same-length one-byte-different key → false. (17 tests total, was 15.)
- Route (`ops-endpoints-auth.test.ts`): +4 — same-length wrong key → 404 for each of
  the 4 endpoints. (20 tests total, was 16.) Existing scenarios preserved: valid key
  passes; wrong different-length key rejects 404; missing key rejects 404.

## 5. Commands run

```
git status --short
npx vitest run src/__tests__/security/diagnostic-key-validation.test.ts
npx vitest run src/__tests__/security/ops-endpoints-auth.test.ts
npx prisma validate
npx vitest run src/__tests__/founder-recovery/
npm test
npm run build
```
(Task referenced `src/tests/...`; the real path is `src/__tests__/...`.)

## 6. Results

| Command | Result |
|---|---|
| `diagnostic-key-validation.test.ts` | **17 passed** |
| `ops-endpoints-auth.test.ts` (in-process) | **20 passed** |
| `npx prisma validate` | valid 🚀 |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` (full) | **193 files passed, 15 skipped, 0 failed; 5473 tests passed, 159 skipped** |
| `npm run build` | Compiled successfully (9 owner/recovery routes) |

No regressions: the +6 new tests raised the count (5467 → 5473) and no existing test
broke, confirming nothing relied on the buggy same-length acceptance.

## 7. Security impact

Closes an authentication-bypass on diagnostic-key-gated endpoints: previously any
attacker who guessed the **length** of `OPSIQ_DIAGNOSTIC_KEY` could pass any
same-length value to reach operational metrics (`/api/ops/*`) and the extra
diagnostic branches of diagnosis/signup/internal proof routes. After the fix, only
the exact key is accepted, with timing-safe comparison retained. Coverage now
explicitly includes same-length wrong keys at both the unit and route levels.

## 8. No secrets used

Confirmed — only fake test keys (`test-key`, `bad-key!`, `test-diagnostic-key-123`,
`XXXX-...`) were used. No real keys, URLs, or secrets appear in code, tests, or logs.

## 9. Owner Recovery Module 1 unaffected

Confirmed — no Owner Recovery code/migration/routes/tests changed; founder-recovery
suite (38/8) and build (9 routes) remain green.

## 10. Module 2 / public-SaaS status

- **Module 2 remains blocked** — Module 1 is still not migrated to a real/staging DB
  nor staging-cycle proven.
- **Public/SaaS remains frozen.**
