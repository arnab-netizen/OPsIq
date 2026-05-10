# CONTINUE BUILD: Enterprise-Grade Execution Framework
# Phase 3 → Phase 4 Progression (Non-DB Code-Only Tasks)

**Status**: Phase 3 code-level 100% COMPLETE. All event systems ACTIVE. DB gates blocked by environmental network issue (not config fault).

---

## CURRENT STATE

- ✓ EventEmitterService wired into critical mutations (recommendation.ts, action.ts, evidence.ts)
- ✓ EventReplayEngine wired into projection rebuild path (ProjectionRebuildEngine)
- ✓ SnapshotOptimizationEngine wired into replay completion (EventReplayEngine Step 4)
- ✓ Phase 3 static gates: ALL PASSING
- ✗ Database: Network connectivity blocker (cannot reach Neon AP-Southeast-1 endpoint)
- ✓ All non-DB Phase 3 work complete. Phase 4 gate readiness pending.

---

## EXECUTION FRAMEWORK: Enterprise-Grade Per-Task Workflow

**ENFORCE**: One non-DB code slice per run. No feature creep. No DB modifications. No environment variable changes.

### STEP 1: PRE-TASK CHECKLIST (GO/NO-GO DECISION)

**1a. Repository Health**
```bash
git status                              # Must show clean tree or 1-2 committed changes
git branch                              # Confirm on main
git log --oneline -n 3                  # Review recent commits
```

**1b. Baseline Gates (MUST ALL PASS)**
```bash
npm ci                                  # Install exact dependencies
npx prisma validate                     # Schema syntax and constraints
npx tsc --noEmit                        # Type check entire project
npm run build                           # Full build (catches integration errors)
```

**1c. Pre-Task Audit (BEFORE ANY IMPLEMENTATION)**

For each candidate task, verify:

1. **No Duplicate Engines**: Search codebase for existing implementations
   ```bash
   grep -r "export class.*Engine" src/services/*.ts | grep -i "[SYSTEM_NAME]"
   grep -r "[SYSTEM_NAME]" package.json                          # Check dependencies
   find src -name "*[system-name]*" -type f                       # Find related files
   ```

2. **Clear Integration Path**: Trace call chain from critical mutation to engine
   ```bash
   grep -r "create[A-Z]*\(.*\)" src/graphql/mutations/ | head -5  # Find mutations
   grep -r "[ENGINE_NAME]" src/graphql/ src/pages/ src/services/  # Find callers
   ```

3. **No False PARKED Claims**: Verify system is truly parked (not already called)
   ```bash
   grep -r "[SYSTEM_NAME].*from" src/services/ | grep import      # All imports
   grep -r "[SYSTEM_NAME]\." src/ | grep -v test | grep -v ".d.ts" # All usages
   ```

4. **Honest Classification Check**:
   - ACTIVE = Called from critical mutation path (recommendation.ts, action.ts, evidence.ts) OR called from production engine (ProjectionRebuildEngine, EventReplayEngine)
   - PARKED = Code exists but never called from any production path
   - Do NOT mark ACTIVE unless call chain proven via grep

5. **Check execution_state.json alignment**:
   ```bash
   grep "[SYSTEM_NAME]" .claude/execution_state.json              # Current status
   ```

**STOP HERE IF**:
- Any baseline gate fails → Fix error first, re-run gate, confirm all pass
- System already ACTIVE in execution_state → Task complete, loop to next
- Duplicate implementation exists → Consolidate, do not proceed with new code
- Call chain unverifiable → Clarify scope, do not implement

---

### STEP 2: IMPLEMENTATION (SCAN → WIRE → TEST)

**2a. Code Audit (SCAN BEFORE WRITING)**

Read all related files to confirm existing code state:
```bash
# For system [SYSTEM_NAME]:
cat src/services/[engine-name].ts                           # Read full implementation
cat src/services/[caller-engine].ts                         # Read where it will be called
cat src/__tests__/services/[related-test].test.ts           # Review test patterns
```

Record observations:
- Current state of implementation
- Integration points identified
- Existing test patterns
- No duplicate code paths

**2b. Implement Minimal Wiring (ONE SLICE ONLY)**

- Add import statement for the engine
- Call engine method from critical path (single call point)
- Add logging to prove execution
- No refactoring, no cleanup, no optimization beyond scope

Example commit size: 5-15 lines of code + test file

**2c. Add/Update Tests (VERIFY WIRING)**

Create integration test verifying:
1. System is imported
2. System method is called from critical path
3. Correct parameters passed
4. Called at correct point in flow (before/after specific step)

Test pattern: Static verification (source code inspection)
```typescript
it("should call [SYSTEM_NAME].[METHOD] from critical path", async () => {
  const fs = await import("fs");
  const content = fs.readFileSync("src/services/[caller].ts", "utf-8");
  expect(content).toContain('import { [SYSTEM] }');
  expect(content).toContain("[SYSTEM].[METHOD]");
  expect(content).toContain("[SPECIFIC_STEP_COMMENT]");
});
```

---

### STEP 3: GATE VALIDATION (SEQUENTIAL, STOP ON FIRST FAILURE)

**SEQUENCE** (run in order, stop on first failure):

```bash
npx prisma validate                     # Schema validation
npx tsc --noEmit                        # TypeScript check
npm run build                           # Full build
npm test -- [task-specific-test-file]   # Task integration tests only
```

**ACCEPTABLE OUTCOMES**:
- ✓ All gates pass → Proceed to STEP 4
- ✗ Any gate fails → Stop, fix error, re-run failing gate, confirm pass, then proceed
- ⚠ Pre-existing errors (unrelated to this task) → Document, proceed only if new errors count = 0

**REPORT GATE RESULTS**:
```
Gate Status:
- prisma validate: ✓
- tsc --noEmit: ✓ (X pre-existing TypeScript errors, 0 new)
- npm run build: ✓
- npm test (task-specific): ✓ (Y tests passing)
```

---

### STEP 4: COMMIT & STATE UPDATE (CLEAN CHANGES ONLY)

**4a. Verify Clean State**
```bash
git status                              # Must show only modified/new task files
git diff --stat                         # Show summary of changes
```

**4b. Commit Code Changes**

```bash
git add [modified-files] [new-test-file]
git commit -m "Wire [SYSTEM] into [CRITICAL_PATH]: [one-line reason]

- [specific code change #1]
- [system] now called from [mutation/engine]
- Integration point: [file.ts:line-range]
- Test: [test-file-path]
- Static gates: prisma validate ✓, tsc ✓, build ✓, test ✓

https://claude.ai/code/[SESSION_ID]"
```

**4c. Update execution_state.json** (HONEST CLASSIFICATION ONLY)

Move system from `event_systems_parked` to `event_systems_active` with:
- `system`: Name of system
- `status`: "ACTIVE"
- `wired_into`: [Files where it's called from]
- `critical_path`: true/false (true only if called from recommendation.ts, action.ts, evidence.ts)
- `proof`: "Called from [specific location] to [specific purpose]"

**RULES FOR HONEST CLASSIFICATION**:
- Do NOT claim ACTIVE unless grep confirms call from production path
- Do NOT claim critical_path: true unless called from mutation (not just internal engine)
- Do NOT claim runtime verification while DATABASE_URL is blocked
- Update `completed_work_this_session` to list what was accomplished
- Update `last_update` timestamp

**4d. Push Commits**
```bash
git push -u origin main
# If HTTP 403: Use GitHub API (mcp__github__push_files)
```

---

### STEP 5: REPORT & VERIFY (CONCISE FORMAT ONLY)

**REQUIRED OUTPUT FORMAT**:

```
Task [N]: [SYSTEM_NAME] wiring COMPLETE

Files Changed:
- src/services/[caller].ts
- src/__tests__/services/[test-file].test.ts

Proof of Wiring:
- Called from: [module.ts:line-range] in [function-name]()
- Call: [SYSTEM].[METHOD](aggregateId, type, state, lastEvent.eventNumber, workspaceId)
- Purpose: [one-line description]

Static Gates:
- prisma validate: ✓
- tsc --noEmit: ✓ (0 new errors)
- npm run build: ✓
- npm test: ✓ (N tests passing)

Execution State:
- SnapshotOptimizationEngine: ACTIVE (wired into event-replay-engine.ts)
- Updated: execution_state.json, completed_work_this_session
- Committed: [commit-sha]

Blockers:
- DATABASE_URL: Still blocked by network connectivity (not config issue)
- Phase 3 db_gates_status: Remains UNVERIFIED_NO_DATABASE

Next Action:
- [Loop to STEP 1 for Task N+1] OR
- [If DATABASE_URL available: npx prisma migrate deploy && npm test -- phase-3]
```

**NO VERBOSE EXPLANATIONS. No progress commentary. Just facts.**

---

## IDENTIFIED PHASE 3 TASKS (Remaining)

### Task 1: Wire EventReplayEngine into Production Paths
**Status**: ✓ COMPLETE
- Integrated into ProjectionRebuildEngine.rebuildRecommendationProjection()
- Test: src/__tests__/services/projection-rebuild-engine-with-replay.test.ts (2 tests)
- Committed and pushed

### Task 2: Wire SnapshotOptimizationEngine into Production Paths  
**Status**: ✓ COMPLETE
- Integrated into EventReplayEngine.replayAggregate() Step 4
- Test: src/__tests__/services/event-replay-engine-with-snapshot.test.ts (3 tests)
- Committed and pushed

### Task 3: Phase 4 Readiness Gate
**Status**: PENDING (BLOCKED ON TASKS 1-2)
- Prerequisites: All PARKED systems wired → ✓ SATISFIED
- Work: Mark Phase 3 as COMPLETE_CODE_VERIFIED in execution_state
- Unblock: When DATABASE_URL available, run: npx prisma migrate deploy && npm test -- phase-3 (expect 54/54 passing)

---

## DO NOT MODIFY (Environment-Blocked Unless Error Proves Config Fault)

- ❌ DB adapter (Neon adapter + @neondatabase/serverless + @prisma/adapter-neon correct)
- ❌ .env.local (gitignored, not checked in)
- ❌ prisma.config.ts (driverAdapters preview feature enabled correctly)
- ❌ DATABASE_URL (network timeout is infrastructure issue, not configuration issue)

**EXCEPTION**: Only modify if new error message proves config fault:
- Syntax error in adapter
- Missing import statement
- Type mismatch in client instantiation
- File not found error

Current error (P1001: timeout) = network/infrastructure → do not touch config

---

## IMMEDIATE NEXT ACTIONS

1. ✓ Task 1 complete: EventReplayEngine → ProjectionRebuildEngine (DONE)
2. ✓ Task 2 complete: SnapshotOptimizationEngine → EventReplayEngine (DONE)
3. **→ Task 3**: Phase 4 readiness gate (mark Phase 3 COMPLETE_CODE_VERIFIED)
4. **→ When DATABASE_URL available**: 
   - `npx prisma migrate deploy`
   - `npx prisma generate`
   - `npm test -- phase-3` (expect 54/54 tests passing)
   - Update execution_state: `db_gates_status: "VERIFIED_PASSING"`

---

**Last Updated**: 2026-05-10 (Tasks 1-2 complete, all non-DB work finished)
**Execution Model**: Enterprise-grade per-task validation with honest classification, no DB claims while blocked, concise reporting format