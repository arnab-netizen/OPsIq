# NEXT_ACTION_PROTOCOL - Deterministic Phase Advancement

**Effective**: Post Phase 0 Support Hardening (commit 2bfe4cc)  
**Scope**: All Phase advancement work after Phase 0 completion  
**Purpose**: Eliminate ambiguity, reduce context needed, keep prompts ultra-short

---

## PROTOCOL OVERVIEW

Each phase advancement follows this deterministic sequence:
1. Read execution.md (current phase definition)
2. Read execution_state.json (current state)
3. Locate next incomplete phase
4. Implement smallest runtime-complete slice
5. Wire runtime path
6. Add deterministic tests
7. Run verification gates
8. Fix any failures
9. Update execution_state.json
10. Commit stable milestone

**Time Estimate per Phase**: 2-4 hours (depending on slice size)  
**Commits per Phase**: 1-3 (one per stable milestone)  
**Tests per Phase**: Minimum 1, typically 3-5 (deterministic, not flaky)

---

## STEP 1: READ execution.md

```bash
cat execution.md | head -200  # Read current phase definition
grep -A 20 "^## Phase X" execution.md  # Find target phase
```

**What to extract**:
- Phase number and name
- Problem statement (what must be solved)
- Acceptance criteria (how do we know it works)
- Contract requirements (what types/interfaces are needed)
- Integration points (where does this connect)
- Example: Phase 1 must add EvidenceReliabilityEngine and link to Phase 0 Recommendation

**Red flag**: Phase definition is vague or incomplete
- → Clarify via reading execution.md context
- → If still unclear, execution.md needs update (outside this protocol)

---

## STEP 2: READ execution_state.json

```bash
cat .claude/execution_state.json | jq '.phase_status, .completed_phases'
```

**What to extract**:
- Current phase_status (PARTIAL, COMPLETE, or blocked)
- Completed phases (which are stable)
- Ongoing work (what's in progress)
- Parked/blocked work (why, what's blocking)
- Last verified commit hash

**Invariant**: Completed phases are NEVER reworked
- If Phase X is COMPLETE, skip to Phase X+1
- Never re-implement, re-harden, or re-architect completed phases
- Moving forward is faster than reworking

Example:
```json
{
  "phase_status": {
    "Phase 0": "COMPLETE",
    "Phase 1": "PARTIAL"
  }
}
```
→ Phase 0 is FROZEN. Work on Phase 1 (or later if Phase 1 is also complete).

---

## STEP 3: LOCATE NEXT INCOMPLETE PHASE

```
Read phase_status from execution_state.json

for each phase in order:
  if phase_status == "COMPLETE":
    continue (skip, don't rework)
  elif phase_status == "PARTIAL":
    check what's incomplete
    if all acceptance_criteria met:
      mark complete, move to next
    else:
      work on incomplete part here
      break
  elif phase_status == "NOT_STARTED":
    start here
    break
```

**Example decision tree**:
```
Phase 0: COMPLETE → skip
Phase 1: PARTIAL → check acceptance criteria
  - Evidence model: COMPLETE
  - EvidenceReliabilityEngine: PARTIAL (missing confidence assessment)
  - Integration to Recommendation: NOT_STARTED
  → work on confidence assessment + integration
Phase 2: NOT_STARTED → will work here after Phase 1 complete
```

---

## STEP 4: IMPLEMENT SMALLEST RUNTIME-COMPLETE SLICE

**Slice Definition**: A piece of work that:
- Solves one acceptance criterion
- Is independently testable
- Is independently deployable
- Takes 1-2 hours of focused work
- Can be wired into execution path immediately

**Examples of good slices**:
- "Add EvidenceReliabilityEngine with single confidence scoring method"
- "Wire Recommendation → EvidenceReliabilityEngine call in create path"
- "Add OutcomeVerificationContract for fact vs claim separation"

**Examples of bad slices**:
- "Refactor all evidence handling" (too big, multi-criterion)
- "Add evidence database schema" (not runtime-complete without creation/query service)
- "Design evidence validation abstraction" (speculative, no consumer)

**Workflow**:
1. Identify single acceptance criterion (from execution.md)
2. Implement minimum code to satisfy it
3. Add schema/migrations if needed
4. Create test to verify behavior
5. Commit when complete (before moving to next criterion)

**NO**:
- Don't implement infrastructure without consumer (e.g., schema without service)
- Don't create abstractions before concrete usage (e.g., base class before subclasses)
- Don't build "flexible" designs (build what's needed now)
- Don't refactor while implementing (separate concerns)

---

## STEP 5: WIRE RUNTIME PATH

**Definition**: Code path from external request → implementation → response

**Checklist**:
- [ ] API endpoint calls service (or handler calls service)
- [ ] Service instantiates implementation (not abstract/placeholder)
- [ ] Service calls new code (integration point verified)
- [ ] New code returns result
- [ ] Result propagates back to caller
- [ ] Caller receives expected type (no casting, no unknown)

**Testing the wire**:
```bash
# Find caller
grep -r "recommendationCreate\|createRecommendation" src --include="*.ts" | grep -v test | grep -v ".d.ts"

# Verify it calls your new code
# Verify new code is not wrapped in try-catch-ignore (fail closed, remember?)

# Trace the path: caller → service → implementation → response
```

**Red flag**: Code exists but nothing calls it
- → Mark as PARKED in execution_state.json
- → Don't commit; fix the wiring first

---

## STEP 6: ADD DETERMINISTIC TESTS

**Test Requirements**:
- Use test factories from src/__tests__/test-factories.ts (never inline mocks)
- No randomness (no Math.random(), no Date.now() without seeding)
- No external dependencies (no HTTP, no DB without test database)
- No flaky assertions (timing, order-dependent, race conditions)
- Verify observable behavior (not implementation details)

**Test Categories**:

1. **Contract Test** (1 test minimum)
   - Verify input type matches interface
   - Verify output type matches return type
   - Verify error handling (uses canonical ServiceErrorType)

2. **Behavior Test** (1-3 tests)
   - Same input always produces same output
   - Acceptance criterion is satisfied
   - Edge cases handled correctly

3. **Integration Test** (1 test if wired)
   - Caller can invoke → implementation → response
   - Types flow correctly through pipeline
   - Error propagates correctly

**Test Structure**:
```typescript
describe("Phase X - Feature Name", () => {
  describe("Contract", () => {
    it("accepts valid input and returns correct type", () => {
      const input = createTestFactory(/* overrides */);
      const result = implementation(input);
      expect(result).toMatchInterface(ExpectedType);
    });
  });

  describe("Behavior", () => {
    it("satisfies acceptance criterion: X", () => {
      // Test the actual requirement
    });
  });

  describe("Integration", () => {
    it("caller can invoke and receive typed response", () => {
      // Test the wired path
    });
  });
});
```

**Run tests**:
```bash
npm test -- src/__tests__/phase-X-*.test.ts
# OR
npm test -- --grep "Phase X"
```

**Red flag**: Tests require mocking internal functions
- → Code is likely over-coupled or over-abstracted
- → Simplify before adding tests

---

## STEP 7: RUN VERIFICATION GATES

**Always run in this order**:

```bash
# 1. Type checking (catches integration bugs)
npx tsc --noEmit

# 2. Build (catches import/runtime errors)
npm run build
# Note: May fail locally on DATABASE_URL (expected), but TypeScript must pass

# 3. Prisma validation (if schema changed)
npx prisma validate
npx prisma migrate status

# 4. Tests for your changes
npm test -- src/__tests__/phase-X-*.test.ts

# 5. Contract immutability (if touching contracts)
npm test -- src/__tests__/critical-service-contracts.test.ts

# 6. Phase 0 compatibility (never skip)
npm test -- src/__tests__/mvp-operational-flow.test.ts
```

**Success criteria**:
- ✓ tsc --noEmit: 0 errors
- ✓ npm run build: TypeScript passes (data collection may fail, OK)
- ✓ npx prisma validate: valid schema
- ✓ Tests for your changes: all pass
- ✓ Contract tests: 28/28 pass (unchanged)
- ✓ Phase 0 tests: pass (unchanged)

**Failure handling**:
- If tsc fails: fix type error
- If build fails: check import paths, runtime errors
- If Prisma fails: check schema syntax
- If tests fail: check implementation, don't just adjust tests
- If Phase 0 breaks: restore backward compatibility immediately

---

## STEP 8: FIX ANY FAILURES

**Debugging protocol**:

1. **Type errors**: Run tsc, look at line number, fix types
2. **Test failures**: Read test assertion, check implementation, fix behavior (not test)
3. **Integration failures**: Trace caller → service → implementation, find break point
4. **Phase 0 breaks**: Revert to last stable, restart with smaller slice

**Never**:
- Ignore failing tests
- Commit with broken gates
- Skip verification steps
- Use @ts-ignore to hide type errors
- Modify tests to pass instead of fixing code

---

## STEP 9: UPDATE execution_state.json

**After passing all gates**, update execution_state.json:

```json
{
  "phase_status": {
    "Phase X": "PARTIAL" or "COMPLETE"
  },
  "phase_X_work": {
    "initiated": "2026-05-07T12:00:00Z",
    "status": "COMPLETE" or "IN_PROGRESS",
    "slice_completed": "EvidenceReliabilityEngine confidence scoring",
    "acceptance_criteria": {
      "add engine": "COMPLETE",
      "wire to recommendation": "NOT_STARTED"
    },
    "files_created": [...],
    "files_modified": [...],
    "tests_added": 3,
    "gates_status": {
      "typecheck": "PASS",
      "build": "PASS",
      "tests": "PASS"
    },
    "commit_hash": "abc123def456",
    "next_slice": "Wire Recommendation → EvidenceReliabilityEngine call"
  }
}
```

**Marking completion**:
- Phase PARTIAL if some criteria met but not all
- Phase COMPLETE only if all acceptance criteria met + tests + gates pass
- Update timestamps and commit hashes

---

## STEP 10: COMMIT STABLE MILESTONE

**Commit criteria**:
- [ ] All tests passing
- [ ] All gates passing
- [ ] Phase work complete (not mid-phase)
- [ ] execution_state.json updated
- [ ] No Phase 0 changes

**Commit message format**:
```
Phase X: [Slice name] - [What was added/fixed]

[2-3 line description of why this matters]

Files:
- src/[critical files first]
- src/__tests__/[tests added]
- prisma/[schema if changed]

Gates: ✓ All passing (tsc, build, tests, prisma validate)
Phase 0: ✓ Unchanged (27/27 tests passing)
Acceptance criteria: [X/Y complete]

https://claude.ai/code/session_[SESSION_ID]
```

**Example**:
```
Phase 1: EvidenceReliabilityEngine - Add confidence assessment

Evidence model needs reliability scoring before Outcome verification.
Added weighted confidence assessment based on evidence sources and quality.
Wired into Recommendation.create path for confidence propagation.

Files:
- src/services/evidence-reliability-engine.ts (new)
- src/services/recommendation.ts (modified to call engine)
- src/__tests__/evidence-reliability-engine.test.ts (new, 4 tests)
- prisma/schema.prisma (added EvidenceReliability table)

Gates: ✓ All passing (tsc, build, tests, prisma validate)
Phase 0: ✓ Unchanged (27/27 tests passing, 9/9 gates passing)
Acceptance criteria: 1/3 complete (engine built, integrated; still need verification)

https://claude.ai/code/session_01KvtDUxKMFbL7yUL6jRh1kv
```

---

## PROTOCOL SHORTCUTS

**For ultra-short future prompts**, use these templates:

```
"Continue Phase 1: Add EvidenceSourceModel"
→ Protocol executes steps 1-10 automatically for next slice
```

```
"Fix gate failure on Phase 2"
→ Protocol: skip to step 7 (run gates), step 8 (fix), step 10 (commit)
```

```
"Complete Phase X acceptance criteria"
→ Protocol: step 3 (locate incomplete), step 4-10 (complete)
```

```
"Review Phase X readiness"
→ Protocol: step 2 (read state), step 3 (check status), report completeness
```

---

## DECISION TABLE: WHEN TO STOP/CONTINUE

| Scenario | Action |
|----------|--------|
| Phase is COMPLETE | Stop, don't rework. Move to next phase. |
| All acceptance criteria met + tests pass | Mark COMPLETE, commit, move to next |
| Some acceptance criteria met + tests pass | Mark PARTIAL, commit, continue same phase |
| Acceptance criteria not met but tests pass | Implementation incomplete, not yet done |
| Tests fail but gates pass | Fix implementation, re-run tests, don't commit |
| Phase 0 breaks | Revert, restart with smaller slice |
| Uncertainty about next slice | Re-read execution.md acceptance criteria |
| Code exists but nothing calls it | Mark PARKED, document why, continue elsewhere |

---

## REFERENCE CHECKLIST

Before starting each phase:
- [ ] Read execution.md Phase definition
- [ ] Read execution_state.json current state
- [ ] Confirm next phase location
- [ ] Confirm Phase 0 still COMPLETE (never regress)
- [ ] Identify smallest slice (single acceptance criterion)
- [ ] Identify wiring point (where in runtime does this go)

Before committing each slice:
- [ ] Tests passing (new + existing)
- [ ] Gates passing (tsc, build, tests, prisma)
- [ ] execution_state.json updated
- [ ] Commit message complete (what, why, files, gates, phase 0 status)
- [ ] Phase 0 unchanged (no breaking changes)

---

## SESSION BOOKMARKING

At end of each session, provide:
```
## Session Summary

Completed: [Phase X, slice Y]
Status: [PARTIAL or COMPLETE]
Commit: [hash]
Next: [Phase X+1 or next slice in Phase X]
Blocker: [if any]

Key files: [critical changes]
Tests: [count and results]
Gates: [all pass? any issues?]
```

Future prompts can then be:
```
"Continue from session XXX: [Phase/slice]"
```

This loads all context automatically without needing to re-read execution.md or execution_state.json.

---

## PROTOCOL END

This protocol is deterministic and repeatable. Each phase advancement follows the same 10-step sequence. Deviations require updating execution.md, not this protocol.
