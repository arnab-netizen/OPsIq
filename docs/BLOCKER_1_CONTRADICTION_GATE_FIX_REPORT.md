# Blocker 1 Fix Report — Contradiction Gate Dead Branch

**Date:** 2026-06-19  
**File:** `src/domain/business-facts/contradiction-resolver.ts`  
**Function:** `hasBlockingContradiction()`  
**Status:** BLOCKER_1_FIXED_CODE_VERIFIED

---

## Exact Bug

```typescript
// BEFORE (lines 214–224) — function always returned false
export function hasBlockingContradiction(contract: BusinessFactsContract): boolean {
  for (const contradiction of contract.contradictions) {
    if (
      contradiction.status === "unresolved" &&                                  // CHECK A
      ["material_conflict", "critical_conflict"].includes(contradiction.status) // CHECK B
    ) {
      return true;
    }
  }
  return false;
}
```

`contradiction.status` is a single string value. CHECK A requires it to equal `"unresolved"`. CHECK B requires it to be in `["material_conflict", "critical_conflict"]`. These are mutually exclusive values from the same `CONTRADICTION_STATUSES` enum. The AND condition could never be satisfied. The function always returned `false` regardless of input.

---

## Exact Fix

```typescript
// AFTER — returns true for any blocking severity status
export function hasBlockingContradiction(contract: BusinessFactsContract): boolean {
  for (const contradiction of contract.contradictions) {
    if (["material_conflict", "critical_conflict"].includes(contradiction.status)) {
      return true;
    }
  }
  return false;
}
```

The impossible AND branch was removed. The function now returns `true` whenever any contradiction has `status: "material_conflict"` or `status: "critical_conflict"`, and `false` in all other cases.

---

## Tests Added / Updated

**File:** `src/__tests__/business-facts/contradiction-resolver.test.ts`

The existing test in describe block "B06 contradiction resolver — blocking and severity" was:

```typescript
it("identifies unresolved material conflicts that block high-confidence", () => {
  const contract = asContract(examples.contradiction_case);
  const hasBlocking = hasBlockingContradiction(contract);
  expect(typeof hasBlocking).toBe("boolean"); // ← WEAK: passes whether true or false
});
```

This test was passing despite the broken function because `typeof false === "boolean"` is true. It has been replaced with 5 deterministic tests using inline contract construction:

| Test | Input | Expected | Result |
|------|-------|----------|--------|
| `material_conflict → true` | `status: "material_conflict"` | `true` | PASS |
| `critical_conflict → true` | `status: "critical_conflict"` | `true` | PASS |
| `mixed contradictions with material → true` | `["minor_conflict", "material_conflict", "resolved_by_owner"]` | `true` | PASS |
| `all non-blocking → false` | `["minor_conflict", "unresolved", "resolved_by_owner", "resolved_by_source_priority"]` | `false` | PASS |
| `empty array → false` | `[]` | `false` | PASS |

The original weak test was preserved as a sixth test ("identifies blocking contradictions from contradiction_case example") to retain coverage of the real example fixture, reclassified as a smoke test (typeof check only, since the fixture contradictions may have resolution statuses set by `detectAndResolveContradictions`).

**Total tests in file after change:** 21  
**Test result:** 21/21 PASS (vitest, exit code 0)

---

## Runtime Behavior Changed?

**No runtime behavior changed in any caller.** `hasBlockingContradiction` has zero confirmed runtime callers outside tests. The function is exported but not imported by any service, route, or domain module other than the test file.

The function is now logically correct. When wired to a caller, it will return `true` for contradictions with severity status `material_conflict` or `critical_conflict`.

---

## Secondary Finding (Out of Scope — Not Fixed)

`detectAndResolveContradictions()` produces contradictions where `status` is always set to the *resolution* value (`"unresolved"` or `"resolved_by_source_priority"`), not the *severity* value (`"material_conflict"`, `"critical_conflict"`). The severity is stored only in the `description` string field.

This means that in the current live detection flow, `hasBlockingContradiction` will still return `false` for all contradictions produced by `detectAndResolveContradictions` — because none of them will have `status: "material_conflict"` or `status: "critical_conflict"`.

For the gate to function end-to-end, `detectAndResolveContradictions` would need to set `contradiction.status` to the severity value for unresolved conflicts (or a separate `severity` field must be added to the `Contradiction` type). This is a separate wiring task, deferred until BLOCKER-2 and BLOCKER-3 are fixed and a caller is being wired.

**This fix is scoped to correcting the dead branch. The secondary finding is documented, not fixed.**

---

## DB Touched?

No. `hasBlockingContradiction` is a pure domain function with no DB access. No schema changes. No migrations.

---

## Gates Run

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS — no errors |
| `npx prisma validate` | PASS — schema valid |
| `npx vitest run contradiction-resolver.test.ts` | PASS — 21/21 |

---

## Runtime Callers

Zero. Confirmed by grep across all `.ts` files (excluding `__tests__`):

```
grep -rn "hasBlockingContradiction" src/ --include="*.ts" | grep -v "__tests__"
```

Result: only `src/domain/business-facts/contradiction-resolver.ts:214` (the definition).

---

## Remaining Blockers

| Blocker | Status |
|---------|--------|
| BLOCKER-1: `hasBlockingContradiction` dead branch | **FIXED** |
| BLOCKER-2: Admission service does not verify ControlledLearningReview APPROVED | OPEN |
| BLOCKER-3: `eligibilityStatus` accepted from POST body, not read from DB | OPEN |
| HIGH-1: Audit trail missing from 11 controlled learning services | OPEN |
| HIGH-3: `outcomeWindowElapsed` is caller-controlled boolean | DEFERRED |
| HIGH-4: No harm-to-rollout circuit breaker | DEFERRED |
| HIGH-5: Rollout does not require regression result | DEFERRED |

---

## Classification

`BLOCKER_1_FIXED_CODE_VERIFIED`

Not `COMPLETE_READY`. BLOCKER-2, BLOCKER-3, and HIGH-1 remain open. LANE_B re-run is required after BLOCKER-2/3/HIGH-1 fixes (those involve DB queries; this fix does not).
