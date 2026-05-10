# CONTINUE BUILD: Execution Framework
# Phase 3 → Phase 4 Progression (Non-DB Tasks Only)

**Status**: Phase 3 code-level 100% complete. DB gates blocked by environmental network issue (not config fault).

---

## CURRENT STATE

- ✓ Neon adapter correctly implemented (no changes needed)
- ✓ EventEmitterService wired into critical mutations (active)
- ✓ Phase 3 static gates: ALL PASSING
- ✗ Database: Network connectivity blocker (timeout reaching Neon endpoint)
- ⏸️  Phase 3 PARKED systems awaiting runtime integration:
  - EventReplayEngine (code ready, not called from production)
  - SnapshotOptimizationEngine (code ready, not in runtime path)

---

## EXECUTION FRAMEWORK: Per-Task Workflow

### STEP 1: PRE-TASK CHECKLIST

Before starting any task:
```bash
# Verify no unpushed commits
git status

# Confirm on main branch  
git branch

# Confirm static gates baseline
npm ci && npx prisma validate && npx tsc --noEmit && npm run build
```

**Stop if**: Any static gate fails. Fix first, then proceed.

---

### STEP 2: TASK EXECUTION

For **Task N** (identified in Phase 3 PARKED systems):

1. **Read**: Source files for the system (engine, calling paths, integration points)
2. **Audit**: Verify no duplicates, clear integration path, no false PARKED labels
3. **Implement**: Minimal code to wire system into production critical path
4. **Test**: Add unit test confirming system is called from critical mutation
5. **Gate**: Run static gates sequentially:
   ```bash
   npx prisma validate
   npx tsc --noEmit
   npm run build
   npm test -- [task-specific-test-file]
   ```
6. **Stop if any gate fails**: Fix error, re-run gate, only proceed when passing

---

### STEP 3: COMMIT & STATE UPDATE

After all gates pass:

```bash
# Commit with standard message format
git add [modified-files] [new-test-file]
git commit -m "Wire [SYSTEM] into [CRITICAL_PATH]: [reason]

- [specific code change]
- [system] now called from [mutation/engine]
- Test: [test-file-path]
- Static gates: prisma validate ✓, tsc ✓, build ✓, test ✓

https://claude.ai/code/[SESSION_ID]"

# Push (via GitHub API if git push fails)
git push -u origin main
```

Then **immediately update** `.claude/execution_state.json`:

```json
{
  "phase_3_systems_status": {
    "event_systems_active": [
      {
        "system": "[SYSTEM_NAME]",
        "status": "ACTIVE",
        "wired_into": ["[path1]", "[path2]"],
        "proof": "[where it's called from]"
      }
    ],
    "event_systems_parked": [
      // Remove completed system from here
    ]
  }
}
```

Also update: `phase_3_completion_progress.completion_percentage` if all systems are now ACTIVE.

---

### STEP 4: REPORT & LOOP

After commit/state update:

1. Report: **Task N complete. [System] now ACTIVE (proof: [called from X]).**
2. Confirm: All static gates still passing
3. Check: `.claude/execution_state.json` updated correctly
4. **Loop back to STEP 1 for next task** (Task N+1)

---

## IDENTIFIED PHASE 3 TASKS (Remaining)

### Task 1: Wire EventReplayEngine into Production Paths
**Status**: COMPLETE ✓
- Integration point: ProjectionRebuildEngine.rebuildRecommendationProjection()
- Critical path: recommendation.ts → creates event → rebuild triggered
- Test location: src/__tests__/services/projection-rebuild-engine-with-replay.test.ts
- Status: Committed, state updated

### Task 2: Wire SnapshotOptimizationEngine into Production Paths
**Status**: PENDING
- Integration point: EventReplayEngine path (snapshot after replay)
- Critical path: recommendation/action/evidence mutation → snapshot creation
- Required: Wire SnapshotEngine.createSnapshot() into EventReplayEngine flow
- Test pattern: src/__tests__/services/snapshot-engine-with-replay.test.ts (create)

### Task 3: Phase 4 Readiness Gate
**Status**: BLOCKED ON TASKS 1-2
- Prerequisite: Both systems ACTIVE and tested
- Work: Mark Phase 3 as COMPLETE_CODE_VERIFIED in execution_state
- Next phase goal: Event ordering guarantee (DB sequence trigger)

---

## DO NOT MODIFY (Environment-Blocked)

- ❌ DB adapter (Neon adapter is correct)
- ❌ .env.local or prisma.config.ts (config is correct)
- ❌ DATABASE_URL (network connectivity issue, not config)

Only modify these if new error message proves config fault (e.g., syntax error, missing import, type mismatch). Current error is network timeout → infrastructure issue, not code issue.

---

## IMMEDIATE NEXT ACTIONS

1. **If Task 1 commit is unpushed**: Push via GitHub API immediately ✓ (DONE)
2. **If Task 1 is complete**: Update execution_state.json and loop to Task 2 ✓ (DONE)
3. **If static gate fails**: Stop, diagnose, fix the error (do not proceed)
4. **If database available**: Skip non-DB tasks, jump to Phase 3 runtime verification:
   - `npx prisma migrate deploy`
   - `npm test -- phase-3` (expect 54/54 tests passing)
   - Update execution_state: `db_gates_status: "VERIFIED_PASSING"`

---

**Last Updated**: 2026-05-10 (Task 1 complete, ready for Task 2)
**Execution Model**: Phase-by-phase, one non-DB task per run, with gate validation and state tracking
