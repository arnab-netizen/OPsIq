# Required Corrective Actions
**Date:** 2026-07-12  
**Purpose:** Minimum permanent corrective controls that must be in place for the PERMANENT_CLOSURE_STANDARD to be satisfiable.

---

## Action A: Update `auth-governance-scanner.ts` to Reflect Current Canonical Standard

**Priority:** CRITICAL  
**Why:** CI runs `governance:scan:auth` on every push. The scanner currently recommends `withEnforcementFull` as the canonical replacement for `withRequestContext`. A7.7 established `withCanonicalEnforcement` as the canonical standard. CI is actively giving wrong guidance.

**Specific changes required:**

1. Line 33: Change `'withRequestContext is forbidden. Use withEnforcementFull.'`  
   → `'withRequestContext is forbidden. Use withCanonicalEnforcement from @/lib/canonical-route-enforcement.'`

2. Lines 133–136: Update remediation instructions:
   - Change "Replace withRequestContext with withEnforcementFull" → "Replace withRequestContext with withCanonicalEnforcement"
   - Change "Replace direct getSession() with withAuth()" → "Replace direct getSession() with withCanonicalEnforcement"

3. Add new detection rule for `withEnforcementFull` usage in route files:
   ```typescript
   {
     name: 'withEnforcementFull in routes',
     severity: 'high' as const,
     pattern: /export const.*= withEnforcementFull/,
     message: 'withEnforcementFull is legacy. Use withCanonicalEnforcement from @/lib/canonical-route-enforcement.',
   }
   ```

**Files changed:** `scripts/auth-governance-scanner.ts`  
**Test:** `npm run governance:scan:auth` must pass after change; run against a sample route using `withCanonicalEnforcement` to confirm no false positive.

---

## Action B: Delete `src/services/workspace/context.ts`

**Priority:** HIGH  
**Why:** The file exports `requireWorkspaceContext` (session-based, no DB lookup). All 6 prior callers were removed in A7.7-Batch12. The file is an orphan but remains callable. Leaving it creates a discoverable (IDE auto-complete) but unsafe implementation.

**Verification before deletion:**
```bash
grep -rn "from.*services/workspace/context" src/ --include="*.ts" | grep -v "context.ts"
# Must return 0 results before deleting
```

**If result is 0:** Delete the file. Update DC-02 allowlist to remove the `"src/services/workspace/context.ts"` entry (it was there to prevent the gate from flagging the function's own definition).

**Files changed:** `src/services/workspace/context.ts` (deleted), `scripts/a77-prevention-gates.ts` (DC-02 allowlist updated)

**Note on naming confusion:** `src/services/workspace/activation-context.ts` has its own `requireWorkspaceContext` (DB-backed, correct) — this is a different function and must NOT be deleted. `src/lib/service-auth.ts` has yet another `requireWorkspaceContext` (string validation) — also different, also correct.

---

## Action C: Wire `governance:scan:a77` into CI

**Priority:** CRITICAL  
**Why:** All 18 DC prevention gates can be bypassed if `governance:scan:a77` doesn't run in CI. Any commit that merges to main after this one can silently reintroduce DC-01 through DC-18 violations.

**Constraint resolution:** A prior session constraint says "Do NOT modify .github workflows." The HISTORICAL CLOSURE RECONCILIATION task explicitly requires "Create one permanent CI-executable closure system" and "Replace broad allowlists with narrow enforceable exceptions" and lists "Wire all 18 DC gates into CI as required blocking steps" as a named required corrective action. The new explicit requirement supersedes the prior general constraint in this specific scope.

**Specific change:**  
In `.github/workflows/ci.yml`, after the `Auth route governance scan (blocking)` step, add:
```yaml
- name: A7.7 recurrence prevention gates (blocking)
  run: npm run governance:scan:a77
  continue-on-error: false
```

**Files changed:** `.github/workflows/ci.yml`

---

## Action D: Add DC-19 Gate for Post-Mutation Fail-Open Audit Detection

**Priority:** HIGH  
**Why:** No automated gate detects `.catch()` on `emitAuditEvent` in write-path handlers. This is the only DC class with a documented recurrence mechanism (REPEATED_DEFECT_ROOT_CAUSES.md RC-6) that has no prevention gate.

**Gate pattern:**
```typescript
// Detect: emitAuditEvent call followed by .catch() in files with db write operations
const failOpenWritePathAudit = rgLines(
  'emitAuditEvent\\([^)]*\\)\\.catch\\(',
  ["src/app/api", "src/services"],
  ["--glob", "*.ts", "--glob", "!*.test.*"]
);
gate("DC-19", "No .catch() on emitAuditEvent in write-path handlers (use fail-closed pattern)", failOpenWritePathAudit, []);
```

**Note:** Read-path (GET handler) `.catch()` on audit is intentional (fail-open). The gate should be scoped to detect the pattern in files that also have `db.` write operations. If the gate is too broad (catches legitimate read-path routes), add them to a narrow allowlist with justification.

**Files changed:** `scripts/a77-prevention-gates.ts`  
**Header update:** Change "18 gates" to "19 gates" in the report header.

---

## Action E: Enable `noUnusedLocals` in TypeScript Configuration

**Priority:** MEDIUM  
**Why:** A7.7-Batch17 found dead imports (`getSession`, `resolveServerRole`, `role` field) that existed for unknown duration without detection. TypeScript's `noUnusedLocals` flag catches these at compile time.

**Change:**  
In `tsconfig.json`, add to `compilerOptions`:
```json
"noUnusedLocals": true,
"noUnusedParameters": true
```

**Risk:** This may surface unused variables across the codebase that were previously invisible. Each surfaced item must be either removed or prefixed with `_` to acknowledge intentional non-use. This should be done as a separate commit after Actions A–D.

**Test:** `npx tsc --noEmit` must pass after change.

---

## Action F: Merge Branch to Main

**Priority:** CRITICAL — blocks all other actions from reaching production  
**Why:** All A7.7 work (48 commits, Actions A–E) exists only on the branch. Until merged, production runs the pre-A7.7 state.

**Prerequisites for merge:**
- Actions A, B, C, D complete (on this branch)
- `npm run build` PASS
- `npx tsc --noEmit` PASS
- `npm run governance:scan:a77` PASS (18+ gates)
- PR opened from `claude/phase-6f-governance-findings-5gkiec` → `main`
- CI green on branch (triggers postgres:16 DB proof)

---

## Corrective Action Ordering

```
A (auth scanner update) — can be done now, low risk
B (delete context.ts)  — can be done now after verifying 0 callers
D (DC-19 gate)         — can be done now, adds to gate count
E (noUnusedLocals)     — separate commit, do after A-D
C (wire A77 into CI)   — do with or after E; requires ci.yml
F (merge)              — requires PR; requires CI green; do last
```

**Actions A, B, D are implemented in this reconciliation session (2026-07-12).**

---

## Tracking

| Action | Status | Commit |
|--------|--------|--------|
| A: Update auth-governance-scanner.ts | DONE (this session) | TBD |
| B: Delete context.ts | DONE (this session) | TBD |
| C: Wire governance:scan:a77 into CI | PENDING | — |
| D: Add DC-19 gate | DONE (this session) | TBD |
| E: Enable noUnusedLocals | PENDING | — |
| F: Merge branch to main | PENDING | — |
