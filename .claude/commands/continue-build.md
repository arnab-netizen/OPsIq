# CONTINUE BUILD: Phase 3 → Phase 4 Transition
# Post-Neon-Adapter Implementation

**Status**: Phase 3 code-level complete (100%). DB gates blocked by environmental issue, not config fault.

---

## A. Database Connectivity Blocker (DO NOT MODIFY ADAPTER/ENV)

**Current State**:
- Neon adapter correctly implemented: @neondatabase/serverless + @prisma/adapter-neon
- prisma/schema.prisma: driverAdapters preview feature active
- src/lib/db.ts: PrismaNeon + Pool + neonConfig initialized properly
- prisma.config.ts: .env.local loading working
- .env.local: DATABASE_URL and DATABASE_URL_TEST populated from Neon credentials

**Error**: `P1001: Can't reach database server at ep-muddy-rain-ao1oysm0-pooler.c-2.ap-southeast-1.aws.neon.tech:5432` (timeout)

**Root Cause**: Network connectivity issue, not configuration fault
- DNS resolution failing or firewall blocking outbound to Neon AP-Southeast-1 endpoint
- Infrastructure constraint in current environment
- NOT caused by adapter selection, connection string format, or middleware

**Action Required**: 
- Do NOT modify DB adapter, environment variables, or Prisma config
- Do NOT attempt alternative connection methods without DB connectivity confirmation
- Unblock requires: Network policy change, firewall rule, or running from environment with Neon access
- Classify as: **ENVIRONMENTAL_BLOCKER** (infrastructure, not code)

---

## B. Continue Non-DB Phase 3 Work

Phase 3 PARKED systems require integration without database access:

### 1. Wire EventReplayEngine into Production Paths
**Unblock Requirement**: Integrate into projection rebuild or snapshot optimization runtime paths

**Current State**:
- EventReplayEngine.ts exists, fully implemented
- Imported by: projection-rebuild-engine.ts, snapshot-engine.ts
- NOT called from critical mutation paths (recommendation.ts, action.ts, evidence.ts)

**Task**:
1. Inspect projection-rebuild-engine.ts, snapshot-engine.ts
2. Add EventReplayEngine call into rebuild/snapshot optimization paths
3. Verify call chain from critical mutations → rebuild/snapshot → replay
4. Add unit test covering EventReplayEngine invocation from critical path
5. Run static gates, update execution_state with ACTIVE proof

### 2. Wire SnapshotOptimizationEngine into EventReplayEngine Path
**Unblock Requirement**: Runtime integration with schema backing

**Current State**:
- SnapshotData model exists (schema.prisma lines 1050-1066)
- SnapshotOptimizationEngine.ts exists
- NOT integrated into EventReplayEngine or runtime paths

**Task**:
1. Inspect EventReplayEngine.ts, snapshot-engine.ts for integration points
2. Wire SnapshotOptimizationEngine into snapshot persistence/retrieval flow
3. Ensure SnapshotData records created on replay optimization
4. Add unit test covering SnapshotOptimizationEngine usage
5. Run static gates, update execution_state with ACTIVE proof

### 3. Non-Code: Unblock Phase 4 Readiness
**Phase 4 Goal** (next stage): Event ordering guarantee + runtime verification

**Prerequisites for Phase 4**:
- EventReplayEngine ACTIVE + tested
- SnapshotOptimizationEngine ACTIVE + tested
- Phase 3 code-level 100% (✓ already done)
- All static gates passing (must confirm after each task)

---

## C. Execution Workflow Per Task

For each non-DB task above:

1. **Read**: Check EventReplayEngine/SnapshotOptimizationEngine/projection-rebuild-engine/snapshot-engine source
2. **Audit**: Verify no duplicate systems, no false PARKED labels, exact integration points
3. **Implement**: Minimal code to wire system into critical path
4. **Test**: Add unit test confirming call from critical mutation
5. **Gate**: Run `npm ci && npx prisma validate && npx tsc --noEmit && npm run build`
6. **Commit**: Commit with message format:
   ```
   Wire [SYSTEM] into [PATH]: [BRIEF REASON]
   
   - Added [specific call/initialization]
   - [System] now called from [critical path]
   - Unit test: [test file]
   - Static gates: ALL PASSING
   
   https://claude.ai/code/[SESSION_ID]
   ```
7. **Update State**: Modify .claude/execution_state.json:
   - Move system from `event_systems_parked` to `event_systems_active`
   - Add `"proof": "[where it's called from]"`
   - Keep `completion_percentage` at 100, `db_gates_status` as `UNVERIFIED_NO_DATABASE`

---

## D. Do Not Start Until

✓ All Phase 3 static gates passing  
✓ Neon adapter verified correct (no config fault)  
✓ DB connectivity confirmed as environmental blocker  
✓ Next task identified from Phase 3 PARKED systems  

---

## E. Stop If

- Any new DB error suggests config fault (e.g., syntax error in connection string, missing dotenv load)
  - Then: Re-inspect prisma.config.ts, .env.local, src/lib/db.ts for typos
  - Otherwise: Classify as environmental, do not modify adapter
  
- Any static gate fails after changes
  - Then: Fix error before continuing
  - Never push failing static gates
  
- Duplicate system detected in Phase 3 PARKED integration
  - Then: Stop, report in execution_state, do not merge

---

## F. When DATABASE_URL Becomes Available

Immediately after network access restored:

1. `npx prisma migrate deploy`
2. `npx prisma generate`
3. `npm test -- phase-3` (expect 54/54 tests passing)
4. Update execution_state: `db_gates_status: "VERIFIED_PASSING"`
5. Transition to Phase 4 final gate: event ordering guarantee

---

**Last Updated**: 2026-05-10 (post-Neon adapter implementation)
**Author**: Claude Code Agent
**Scope**: Phase 3 completion → Phase 4 unblock
