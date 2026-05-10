# CONTINUE BUILD: Autonomous Enterprise-Grade Execution Loop
# Phases 4–13 Progressive Vertical Slices (Non-DB Code-Only Tasks)

**Framework**: Read execution.md (only phase roadmap) → Audit all prior work for runtime wiring → Auto-detect gaps → Select next slice or wiring task → Implement → Gate → Commit → Report → Loop

**CRITICAL**: execution.md is ONLY source for phase roadmap. Never wait for CLAUDE.md definitions.

---

## EXECUTION LOOP (Automatic per /continue-build invocation)

### PHASE DETECTION & AUDIT

1. Read `execution.md` (ONLY phase roadmap — never wait for CLAUDE.md)
2. Read `.claude/execution_state.json` (current progress)
3. **AUDIT ALL PREVIOUSLY IMPLEMENTED PHASES/SLICES** for runtime wiring proof
4. Reclassify any system lacking production caller as COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE or WIRED_NOT_CALLED
5. Auto-detect next work: highest-priority wiring gap OR next non-DB code slice

**Decision Rule**:
- If any implemented slice has NO caller proof → Prioritize wiring that gap first
- If Phase N is code-complete (100%) but not API/runtime wired → Classify as COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE, then wire it
- If Phase N fully wired and tested → Proceed to Phase N+1 non-DB slices
- If Phase N has pending non-DB slices → Continue with next slice
- **NEVER wait for CLAUDE.md definitions** — execution.md is the only roadmap

---

## WIRING VERIFICATION AUDIT (Before Selecting New Work)

For each implemented system, verify:

### Caller Proof Checklist
- [ ] **Caller file**: Where is this system called? (service, API route, GraphQL resolver, etc.)
- [ ] **Caller function**: What function imports and uses this system?
- [ ] **Input source**: What provides inputs to the caller?
- [ ] **Output consumer**: Who consumes the output?

### Safety & Boundaries
- [ ] **Tenant/workspace enforcement**: Does caller validate workspaceId before accessing?
- [ ] **Capability/auth checks**: Does caller verify user permissions?
- [ ] **DTO boundary**: Does output go through DTO conversion before exposure?
- [ ] **Audit/event behavior**: Are material mutations logged?

### Test Evidence
- [ ] **Integration test**: Do tests prove the full path (caller → system → output)?
- [ ] **Tenant isolation test**: Do tests verify workspaceId is enforced?

### Classification Guide
```
DOMAIN_CONTRACT_ONLY
  → Pure TypeScript types/interfaces
  → No service implementation
  → Tests validate types only

WIRED_NOT_CALLED  
  → Service/engine implemented + fully tested
  → Caller not yet built OR reserved for future
  → No production caller proof
  → Next: Build the caller

COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE
  → Service + Caller implemented
  → Static gates pass (tsc, tests, prisma)
  → NO production path proof (API endpoint, service integration, etc.)
  → Next: Wire into production API/route

RUNTIME_ACTIVE_WIRED_TESTED
  → Service fully integrated into production path
  → Caller has live API endpoint/GraphQL resolver/service method
  → Integration tests prove full path
  → Tenant/auth/audit verified
  → Ready for deployment
```

---

## STEP 1: AUDIT ALL PRIOR WORK (Automatic)

### 1a. Repository Health
```bash
git status                              # Confirm clean state
git branch                              # Note current branch
```
**STOP IF**: Uncommitted work unrelated to current task → Commit or stash first

### 1b. Scan Each Implemented System
```bash
# For Phase 6 Slice 2 (RecommendationGeneratorEngine):
grep -r "RecommendationGeneratorEngine" src/ --include="*.ts" \
  | grep -E "(import|from)" | grep -v test | grep -v ".test.ts"
# Look for: service.ts importing, routes/mutations using, integration tests

# Count production references (not test files):
grep -r "RecommendationGeneratorEngine" src/ --include="*.ts" \
  | grep -v "\.test\.ts" | grep -v "src/__tests__" | wc -l
```

Record per system:
- **File**: src/services/recommendation-generator.ts
- **Methods**: generateSurvivalRecommendations(), generateGrowthRecommendations(), generateOperationalRecommendations()
- **Production callers found**: Count them; if 0, classify as WIRED_NOT_CALLED
- **Tests prove path**: Integration tests exist? If only unit tests, incomplete wiring
- **Reclassification**: Update in execution_state.json

### 1c. Update execution_state.json with Reclassification
```bash
# Reclassify WIRED_NOT_CALLED systems with 0 production callers
jq '.phase_N_systems_status.implemented_slices[] |= 
  (if .classification == "WIRED_NOT_CALLED" and .production_caller_count == 0
   then .classification = "COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE" |
        .wiring_status = "No production caller found. Ready for wiring phase."
   else . end)' \
  .claude/execution_state.json > /tmp/state.json && \
mv /tmp/state.json .claude/execution_state.json
```

### 1d. Select Next Work
```bash
# Priority 1: Any COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE → Wire it
echo "=== Wiring gaps needing implementation ==="
jq '.phase_N_systems_status.implemented_slices[] | 
  select(.classification == "COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE") |
  {slice, wiring_status}' \
  .claude/execution_state.json

# Priority 2: Next non-DB code slice from pending_slices
echo "=== Next code slice ==="
jq '.phase_N_systems_status.pending_slices[0]' .claude/execution_state.json
```

---

## STEP 2: TASK SELECTION

### 2a. Wiring Gap or New Slice?
- **If wiring gap found**: Wire that system first (don't build new phase)
- **If all prior phases wired**: Build next non-DB slice from execution.md

### 2b. Pre-Task Audit (for new slices)
- [ ] No duplicate: `grep -r "ClassName" src/services src/domain`
- [ ] Integration path clear: What caller will use this?
- [ ] Not already ACTIVE: Check execution_state.json classification

---

## STEP 3: IMPLEMENTATION (One Task = One Slice OR One Wiring Gap)

### For NEW NON-DB SLICE:
- Create ONE service/engine per slice
- Add ONE domain contract if needed
- Add ONE test file (10-20 focused tests)
- **No production caller yet** → Classify as WIRED_NOT_CALLED
- **No database changes**

### For WIRING/INTEGRATION:
- Build ONE caller (API route, GraphQL resolver, service integration)
- Import and wire system into caller
- Add integration tests proving full path (caller → system → DTO → consumer)
- Verify tenant/auth/audit enforcement
- Reclassify to COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE (ready for deploy)

### File Structure for Wiring

**Example: Wire RecommendationGeneratorEngine into GraphQL**

File: `src/graphql/resolvers/recommendation.resolver.ts`
```typescript
import { RecommendationGeneratorEngine } from "@/services/recommendation-generator";
import { validateWorkspaceId, checkCapability } from "@/lib/auth";

export const recommendationResolver = {
  Query: {
    recommendations: async (_, { engagementId }, { userId, workspaceId }) => {
      // Auth: Validate workspace
      validateWorkspaceId(workspaceId);
      
      // Capability: Check user can access
      await checkCapability(userId, "read_recommendations", workspaceId);
      
      // Load engagement context from DB
      const engagement = await db.engagement.findUnique({
        where: { id: engagementId, workspaceId }
      });
      if (!engagement) throw new NotFoundError("Engagement");
      
      // Generate recommendations (Slice 2)
      const recs = RecommendationGeneratorEngine.generateSurvivalRecommendations({
        workspaceId,
        userId,
        survival_health: engagement.survivalHealth,
        // ... other context
      });
      
      // Score recommendations (Slice 3)
      const scored = recs.map(r => ({
        ...r,
        priority_score: RecommendationPriorityScorerEngine.scoreRecommendation(r)
      }));
      
      // Emit audit event for access
      await EventEmitterService.emit({
        type: 'RECOMMENDATIONS_ACCESSED',
        userId,
        workspaceId,
        engagementId,
        count: scored.length
      });
      
      // Convert to DTO (boundary enforcement)
      return scored.map(toRecommendationDTO);
    }
  }
};
```

File: `src/__tests__/graphql/recommendation.resolver.test.ts`
```typescript
describe("Recommendation Resolver (Wiring Test)", () => {
  it("should integrate generator → scorer → DTO end-to-end", async () => {
    const resolver = recommendationResolver.Query.recommendations;
    
    // Full path test
    const recs = await resolver(null, 
      { engagementId: "eng-1" },
      { userId: "user-1", workspaceId: "ws-1" }
    );
    
    // Prove full path: generator → scorer → DTO
    expect(recs).toHaveLength(2);
    expect(recs[0]).toHaveProperty("priority");
    expect(recs[0]).not.toHaveProperty("internal_debug"); // DTO boundary
  });
  
  it("should enforce workspace isolation in resolver", async () => {
    const resolver = recommendationResolver.Query.recommendations;
    expect(() => 
      resolver(null, 
        { engagementId: "eng-1" }, 
        { userId: "user-1", workspaceId: "" }
      )
    ).toThrow("workspaceId");
  });
  
  it("should emit audit event on access", async () => {
    const emitSpy = jest.spyOn(EventEmitterService, 'emit');
    
    const resolver = recommendationResolver.Query.recommendations;
    await resolver(null, 
      { engagementId: "eng-1" },
      { userId: "user-1", workspaceId: "ws-1" }
    );
    
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RECOMMENDATIONS_ACCESSED' })
    );
  });
});
```

---

## STEP 4: GATE VALIDATION (Sequential, Stop on First Fail)

### 4a. Static Gates
```bash
echo "=== prisma validate ===" && \
npx prisma validate 2>&1 | grep -i "valid" && echo "✓" || echo "✗"

echo "=== tsc --noEmit ===" && \
npx tsc --noEmit 2>&1 | grep -c "error TS" | head -1

echo "=== npm test ===" && \
npm test -- src/__tests__/{domain,services,graphql}/[name].test.ts 2>&1 | tail -5
```

**Acceptable**:
- ✓ All gates pass
- ⚠ Pre-existing errors in seed/db (allowed, document count)
- ✗ STOP if: Any new error in implemented/wired code

---

## STEP 5: COMMIT & STATE UPDATE

### 5a. Update execution_state.json

For NEW SLICE:
```bash
jq '.phase_N_systems_status.implemented_slices += [{
  "slice": "Phase N Slice X: [NAME]",
  "status": "COMPLETE",
  "classification": "WIRED_NOT_CALLED",
  "files": ["src/services/[name].ts", "src/__tests__/services/[name].test.ts"],
  "committed": "[sha]",
  "tests_passing": "N/N",
  "production_caller_count": 0,
  "wiring_status": "Awaiting caller implementation"
}] | .phase_N_completion_progress.completion_percentage = [%]' \
  .claude/execution_state.json > /tmp/state.json && \
mv /tmp/state.json .claude/execution_state.json
```

For WIRING FIX:
```bash
jq '.phase_N_systems_status.implemented_slices[] |= 
  (if .slice == "Phase N Slice X: [NAME]" 
   then .classification = "COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE" |
        .production_caller = "src/graphql/resolvers/[name].resolver.ts:L42" |
        .integration_test_file = "src/__tests__/graphql/[name].resolver.test.ts" |
        .wiring_status = "Wired into production path (GraphQL resolver). Integration tests pass."
   else . end)' \
  .claude/execution_state.json > /tmp/state.json && \
mv /tmp/state.json .claude/execution_state.json
```

### 5b. Commit
```bash
git add -A .claude/execution_state.json src/
git commit -m "Phase N Slice X: [NAME] or [NAME] wiring

[Brief description of implementation or wiring]
- Classification: [WIRED_NOT_CALLED | COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE]
- Files: [list]
- Tests: [count and integration proof]
- Caller: [resolver/route/service if wiring]
- Tenant safety: [enforced where]
- Audit event: [type emitted]

Static gates:
- prisma validate: ✓
- tsc --noEmit: ✓ (0 new errors)
- npm test: ✓ (N/N passing, integration tests included)

https://claude.ai/code/[SESSION_ID]"

git push -u origin $(git branch --show-current)
```

---

## STEP 6: REPORT (Facts Only)

### For NEW SLICE:
```
PHASE N SLICE X: [SYSTEM_NAME]

Files:
- src/services/[name].ts (X lines)
- src/__tests__/services/[name].test.ts (N tests)

Wiring Proof:
- Status: WIRED_NOT_CALLED (implementation complete, no production caller yet)
- Next step: Build caller in next /continue-build iteration
- Tests: N unit tests, 0 integration tests

Static Gates:
- prisma validate: ✓
- tsc --noEmit: ✓ (0 new errors)
- npm test: ✓ (N/N passing)

Committed: [sha]
Pushed: ✓

Blockers: None

Next: Auto-detect → [wire this system OR next slice]
```

### For WIRING FIX:
```
PHASE N SLICE X: [SYSTEM_NAME] WIRING

Files:
- src/graphql/resolvers/[name].resolver.ts (caller, X lines)
- src/__tests__/graphql/[name].resolver.test.ts (integration tests, N tests)

Wiring Proof:
- Caller: src/graphql/resolvers/[name].resolver.ts:L42 (Query.recommendations)
- Input: Engagement context from DB query, validated workspaceId
- Output: DTO with no internal fields exposed
- Tenant: validateWorkspaceId enforced before DB access (L45)
- Auth: checkCapability verified before generation (L46)
- Audit: EventEmitterService.emit('RECOMMENDATIONS_ACCESSED') on access (L60)
- Path: RecommendationGeneratorEngine → RecommendationPriorityScorerEngine → toRecommendationDTO
- Tests: 3 integration tests proving full path

Classification: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE

Static Gates:
- prisma validate: ✓
- tsc --noEmit: ✓ (0 new errors)
- npm test: ✓ (N/N passing, all integration tests included)

Committed: [sha]
Pushed: ✓

Blockers: None

Next: Auto-detect → [next wiring gap OR next slice]
```

---

## RULES (Non-Negotiable)

✓ DO:
- Audit ALL prior work before selecting next task
- Reclassify systems without production callers
- Never mark ACTIVE without caller file proof
- Use execution.md as ONLY phase roadmap (never wait for CLAUDE.md)
- One run = one deploy-ready slice OR one wiring fix
- Wire before building new phase (fix COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE first)
- Update execution_state with classifications and caller proof
- Prove wiring path in integration tests (caller → system → DTO → consumer)
- Emit audit events for material mutations/access
- Enforce tenant/auth at caller boundary

✗ DON'T:
- Wait for CLAUDE.md phase definitions
- Build new phase if prior phases not wired
- Mark ACTIVE without production caller proof
- Skip audit before selecting work
- Change DB config or migrations
- Commit without updating execution_state
- Report without wiring proof or reclassification
- Skip integration tests for wiring tasks
- Expose internal fields (use DTO boundary)

---

## ENTRY POINT: /continue-build

1. Audit all implemented slices for runtime wiring
2. Reclassify based on caller proof
3. Select: highest-priority wiring gap OR next non-DB slice
4. Implement (new slice) or wire (integration)
5. Update execution_state with classification/caller
6. Run gates, commit, push
7. Report with wiring proof
8. Exit (loop ready for next /continue-build)

**Never ask "proceed?". Just build and wire.**

---

**Last Updated**: 2026-05-11  
**Model**: Audit-first execution loop with mandatory wiring verification before new work  
**Status**: Ready for audit → wire → slice cycle
