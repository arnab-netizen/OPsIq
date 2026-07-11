# PR Cost Control and Root-Cause Closure Policy

**Status:** PERMANENT — applies to all future PRs in this repository.
**Scope:** Every commit that touches production code, tests, schema, or CI configuration.
**Authority:** Overrides any per-phase or per-slice guidance where they conflict.

---

## Why this policy exists

Phase R0 closed systemic root-cause invariants that accumulated across earlier phases. During PR #225, a chain of four sequential CI fix commits occurred because:

1. Tests were written with Jest API (`jest.mock`, `jest.fn`) in a Vitest repo — not caught before push.
2. Each CI run peeled off one issue at a time: jest→vi, then crypto mock missing `default`, then `getDbInstance` missing from the `@/lib/db` mock.
3. Each fix triggered a new CI run (~1.5 hours), multiplying total CI cost.

If all three issues had been caught by running the tests locally before the first push, one commit would have closed the entire defect class. This policy prevents that pattern from recurring.

---

## The Ten Rules

### Rule 1 — Local Gate Before Any CI Push (PR_BUDGET_GATE)

Before pushing any commit that triggers CI, run the affected test file(s) locally and confirm they pass:

```
npx vitest run path/to/affected.test.ts
```

No CI run is opened until the local gate passes. A failing local run is free; a failing CI run costs ~1.5 hours and a CI slot.

### Rule 2 — Root-Cause Diagnosis Before Fix

Every CI failure requires a written root-cause diagnosis before any fix commit is written. The diagnosis must answer:

- **What exactly failed?** (error message, file, line)
- **Why did it fail?** (the underlying cause, not the symptom)
- **How many other places have the same root cause?** (search before fixing one instance)

Pushing a fix without completing this diagnosis is not permitted.

### Rule 3 — Batch All Instances of the Same Root Cause

Once the root cause is identified, search the entire codebase for all instances of that same root cause before writing a single fix. Fix all instances in one commit.

Example: If one test file uses `jest.mock` in a Vitest repo, search every new test file for `jest.` before fixing any of them.

### Rule 4 — Fixes Must Close the Root Cause, Not Paper Over Symptoms

A fix must eliminate the condition that produced the failure. Patching one instance while the same pattern exists elsewhere does not constitute closure. Root cause is closed when no other file can produce the same failure by the same mechanism.

### Rule 5 — No Scope Creep in Fix Commits

Fix commits contain only the changes required to close the identified root cause. No refactors, cleanups, formatting changes, or unrelated improvements in a fix commit. Those belong in separate commits with separate justification.

### Rule 6 — Local Lint and Type Check Before Any Push

Before any push (not just test-specific pushes):

```
npm run lint
npx tsc --noEmit
```

Both must exit clean. A lint or type error that CI catches is a violation of this rule.

### Rule 7 — One PR Per Root-Cause Class

Do not mix fixes from different root-cause families in a single PR unless the PR's stated purpose is multi-family closure (e.g., a dedicated systemic fix PR like Phase R0). Unrelated root causes in the same PR make rollback and bisect expensive.

### Rule 8 — No Fix-on-Fix Commits

If a fix commit introduces a new failure, do not push another fix on top of it. Stop, revert the fix, re-diagnose from the original failure state, then push a corrected fix. Stacking fix-on-fix commits obscures the root cause and makes the PR history unreviewable.

### Rule 9 — Document the Diagnosis in the Commit Message

Every fix commit message must state:
- The root-cause class (e.g., "Vitest API mismatch: jest.* used instead of vi.*")
- The scope of the fix (e.g., "all 4 new R0 test files")
- The verification step taken locally (e.g., "ran vitest run on all 4 files, 49/49 pass")

### Rule 10 — Do Not Start a New Implementation Phase Until the Previous Phase's CI Is Green on Main

A phase is not complete until its PR is merged and `main` is green end-to-end. CI failures from a previous phase must be resolved before new feature work begins. Starting new implementation work while a phase's CI is red adds untracked technical debt and makes root-cause attribution harder.

---

## Enforcement Checklist (Pre-PR Gate)

Before opening any PR, verify:

- [ ] Local test run passes for all affected test files
- [ ] `npm run lint` exits clean
- [ ] `npx tsc --noEmit` exits clean
- [ ] Root-cause diagnosis is written for any defects being fixed
- [ ] All instances of the root cause in scope are fixed in this commit
- [ ] Commit message states the root-cause class and local verification result
- [ ] No unrelated changes included in fix commits

---

## Root-Cause Closure Criteria

A root cause is **closed** when:

1. The specific failure no longer occurs on the affected files.
2. A search of the codebase confirms no other file produces the same failure by the same mechanism.
3. A test or lint rule prevents regression (where feasible).
4. The fix is documented in the commit message and/or relevant audit document.

A root cause is **not closed** by a fix that passes CI on one file while the same pattern exists untouched elsewhere.

---

## Reference: Phase R0 Defect Classes

The following root-cause classes were closed in Phase R0 and must not recur:

| Class | Description | Prevention |
|---|---|---|
| D1-01 | Phantom Prisma field in select (field not in schema) | Run `scripts/scan-prisma-integrity.js` before pushing schema-adjacent changes |
| D3-01 | Missing idempotency guard on critical write route | All POST write routes must check for idempotency-key header |
| D3-03 | Audit event not inside `db.$transaction` with snapshot write | All snapshot/audit pairs must use `db.$transaction(tx => { ... emitAuditEvent(..., tx) })` |
| T-001 | Jest API used in Vitest repo (`jest.mock`, `jest.fn`) | Run `npx vitest run <file>` locally before first push of any new test file |
| T-002 | Built-in module mock missing `default` export | When mocking Node built-ins (`crypto`, `fs`, etc.), always include `default: { ... }` in factory |
| T-003 | `@/lib/db` mock missing `getDbInstance` | Any mock of `@/lib/db` must include `getDbInstance: vi.fn().mockResolvedValue({})` |
