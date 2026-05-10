# CONTINUE BUILD: Autonomous Enterprise-Grade Execution Loop
# Phases 4–13 Progressive Vertical Slices (Non-DB Code-Only Tasks)

**Framework**: Read execution.md + execution_state.json → Auto-detect phase → Pick next slice → Scan → Implement → Gate → Commit → Report → Loop

---

## EXECUTION LOOP (Automatic per /continue-build invocation)

### PHASE DETECTION

1. Read `execution.md` (contract truth)
2. Read `.claude/execution_state.json` (current progress)
3. Determine current phase from `execution_state.current_phase`
4. Determine phase completion % and blockers

**Decision Rule**:
- If Phase 3 db_gates_status = BLOCKED → Skip Phase 3 DB work, start Phase 4 code
- If Phase N is code-complete (completion_percentage = 100) → Proceed to Phase N+1
- Otherwise → Continue Phase N with next pending slice

---

## PHASE PRIORITY ORDER (Non-DB Code Slices Only)

When DB is blocked, execute non-DB slices in this priority:

1. **Phase 4: Survival Intelligence** (current)
   - Slice 2: Shock Detection Engine
   - Slice 3: Org Resilience Scorer
   - Slice 4: Survival Gating Policy
   - Slice 5: Survival Factor Assessment Interface

2. **Phase 5: Financial Normalization** (when ready)
   - Revenue model definition
   - Unit economics calculator
   - Financial health scorer
   - Cash runway modeler

3. **Phase 6–13**: Continue sequentially, non-DB code only

---

## STEP 1: PRE-SLICE SETUP (Automatic)

### 1a. Repository Health
```bash
git status                              # Confirm clean or 1-2 committed
git branch                              # Note current branch
git log --oneline -n 3                  # Confirm recent history
```
**STOP IF**: Uncommitted work unrelated to current phase → Commit or stash first

### 1b. Baseline Gates
```bash
npm ci 2>&1 | tail -5
npx prisma validate 2>&1 | tail -3
npx tsc --noEmit 2>&1 | grep -c "error TS" | head -1
npm run build 2>&1 | tail -10
```
**STOP IF**: Any gate fails → Fix error, re-run gate, confirm pass

### 1c. Read Execution State
```bash
cat .claude/execution_state.json | jq '.current_phase, .phase_4_status, .blockers'
```
Extract:
- Current phase
- Phase completion %
- Pending slices
- Known blockers

### 1d. Branch Selection
```bash
# If on main and next slice requires new branch:
git checkout -b claude/phase-N-[feature-name]-XXXXX

# If already on feature branch for current phase:
git status  # Confirm correct branch
```

---

## STEP 2: SLICE SELECTION & PRE-TASK AUDIT

### 2a. Select Next Slice (Automatic)
From `execution_state.json` → `phase_N_systems_status.pending_slices`, pick:
- First non-DB slice
- No existing implementation
- Clear integration path
- No conflicting parked claim

Example detection:
```bash
grep -A 20 "pending_slices" .claude/execution_state.json
grep -r "ShockDetectionEngine" src/services/ src/domain/  # Check if exists
```

### 2b. Pre-Task Audit (Before Writing)

For the selected slice [SYSTEM_NAME]:

**Check 1: No Duplicate**
```bash
find src -name "*[system-name-lowercase]*" -type f
grep -r "class [SYSTEM_NAME]" src/
grep -r "export.*[SYSTEM_NAME]" src/services/
```
**Stop if**: Implementation already exists → Reuse/upgrade, don't duplicate

**Check 2: Integration Path Clear**
```bash
# For Shock Detection (Phase 4 Slice 2):
grep -r "SurvivalFactor" src/services/  # Depends on Phase 4 Slice 1
grep -r "decision\|action\|recommendation" src/graphql/mutations/ | head -3
grep -r "ShockDetectionEngine" src/
```
**Stop if**: Caller not yet built → Skip this slice, pick another

**Check 3: Honest Classification**
```bash
grep "ShockDetectionEngine\|shock" .claude/execution_state.json
# Verify: status = PARKED or not mentioned (not already ACTIVE)
```
**Stop if**: Already marked ACTIVE → Skip, move to next slice

**Check 4: Scan Existing Domain**
```bash
cat src/domain/reality/survival-factors.ts | head -50
# Understand: what's available for this slice to use
```

---

## STEP 3: IMPLEMENTATION (Minimal, Single Slice)

### 3a. Code Audit (Read Before Write)
```bash
# For Shock Detection Engine caller example:
cat src/services/survival-factor-validator.ts | head -40
cat src/__tests__/services/survival-factor-validator.test.ts | head -30
```
Record:
- Current state of dependencies
- Test patterns
- No duplication

### 3b. Implement Slice (ONE SYSTEM ONLY)

**Rules**:
- Create ONE service/engine per slice
- Add ONE domain contract file if needed
- Wire into ONE caller (existing production path or reserved future caller)
- Add ONE test file with 10-20 focused tests
- NO refactoring, NO cleanup beyond scope

**Fail-Closed Pattern**:
- Validation methods throw on invalid input
- Missing data → UNKNOWN/default state, not assumed safe
- Tenant checks before state access
- Audit trails for material mutations

**Example Slice: Shock Detection Engine (Phase 4 Slice 2)**

File 1: `src/services/shock-detection-engine.ts`
```typescript
// Detect when survival factors cross critical thresholds
export class ShockDetectionEngine {
  static detectShock(assessments: SurvivalFactorAssessment[]): ShockEvent[] {
    const critical = assessments.filter(a => a.health === SurvivalFactorHealth.CRITICAL);
    return critical.length > 0 ? this.buildShockEvents(critical) : [];
  }
  
  private static buildShockEvents(critical: SurvivalFactorAssessment[]): ShockEvent[] {
    return critical.map(a => ({
      id: crypto.randomUUID(),
      type: this.classifyShock(a.category),
      severity: 'CRITICAL',
      triggeredBy: [a.factor],
      detectedAt: new Date(),
      recommended_action: this.recommendAction(a.category),
    }));
  }
  
  private static classifyShock(category: SurvivalFactorCategory): ShockType {
    // Map survival category → shock type
    switch(category) {
      case 'financial': return 'FINANCIAL_SHOCK';
      case 'operational': return 'OPERATIONAL_SHOCK';
      case 'market': return 'MARKET_SHOCK';
      case 'strategic': return 'STRATEGIC_SHOCK';
    }
  }
  
  private static recommendAction(category: SurvivalFactorCategory): string {
    // Recommend action for each shock type
    return `Immediate review needed: ${category} survival factor critical`;
  }
}
```

File 2: `src/domain/survival/shock-events.ts`
```typescript
export enum ShockType {
  FINANCIAL_SHOCK = 'FINANCIAL_SHOCK',
  OPERATIONAL_SHOCK = 'OPERATIONAL_SHOCK',
  MARKET_SHOCK = 'MARKET_SHOCK',
  STRATEGIC_SHOCK = 'STRATEGIC_SHOCK',
}

export interface ShockEvent {
  id: string;
  type: ShockType;
  severity: 'CRITICAL' | 'HIGH';
  triggeredBy: SurvivalFactor[];
  detectedAt: Date;
  recommended_action: string;
  workspaceId?: string; // Tenant scoping
}
```

File 3: `src/__tests__/services/shock-detection-engine.test.ts`
```typescript
describe('ShockDetectionEngine', () => {
  it('should detect financial shock when cash_runway < 3 months', () => {
    const assessments = [{
      factor: 'cash_runway_months',
      category: 'financial',
      health: SurvivalFactorHealth.CRITICAL,
      // ... other fields
    }];
    const shocks = ShockDetectionEngine.detectShock(assessments);
    expect(shocks).toHaveLength(1);
    expect(shocks[0].type).toBe('FINANCIAL_SHOCK');
  });
  
  // 10-15 more tests...
});
```

### 3c. No Database Changes
- ❌ DO NOT add migrations
- ❌ DO NOT modify prisma/schema.prisma
- ❌ DO NOT change DATABASE_URL or .env.local
- ✓ DO use existing Prisma models if needed (read-only queries only)
- ✓ DO define domain contracts (pure TypeScript types)

---

## STEP 4: GATE VALIDATION (Sequential, Stop on First Fail)

### 4a. Static Gates
```bash
echo "=== GATE 1: prisma validate ===" && \
npx prisma validate 2>&1 | grep -E "(valid|error)" && echo "✓ PASS" || echo "✗ FAIL"

echo "=== GATE 2: tsc --noEmit ===" && \
npx tsc --noEmit 2>&1 | grep "[SYSTEM_NAME]" && echo "✗ FAIL: New TypeScript errors" || echo "✓ PASS (0 new errors)"

echo "=== GATE 3: npm run build ===" && \
npm run build 2>&1 | grep "[SYSTEM_NAME]" && echo "✗ FAIL: Build error in new code" || echo "✓ PASS"

echo "=== GATE 4: npm test ===" && \
npm test -- src/__tests__/services/[slice-test].test.ts 2>&1 | tail -20
```

**Acceptable**:
- ✓ All gates pass
- ⚠ Pre-existing errors in seed/db (allowed, document count)
- ✗ STOP if: Any new error in implemented code

---

## STEP 5: COMMIT & STATE UPDATE

### 5a. Verify Clean State
```bash
git status --short
git diff --stat
```
**Must show**: Only new slice files + execution_state.json update

### 5b. Commit Code
```bash
git add src/services/[system].ts src/domain/[domain]/[system].ts \
         src/__tests__/services/[system].test.ts

git commit -m "Phase 4 Slice N: [SYSTEM_NAME] (non-DB foundation)

- [Brief description of what system does]
- Implementation: [key methods/features]
- Integration: Called from [future caller or reserved path]
- Tests: [test file] (N tests, all passing)
- No DB changes: Pure TypeScript types and validators
- Tenant safety: [validation method] enforces workspaceId + userId

Static gates:
- prisma validate: ✓
- tsc --noEmit: ✓ (0 new errors)
- npm run build: ✓
- npm test: ✓ (N/N tests passing)

https://claude.ai/code/[SESSION_ID]"
```

### 5c. Update execution_state.json
```bash
jq '.phase_4_systems_status.implemented_slices += [{
  "slice": "Phase 4 Slice N: [SYSTEM_NAME]",
  "status": "COMPLETE",
  "files": ["src/services/[system].ts", "src/domain/[domain]/[system].ts", "src/__tests__/services/[system].test.ts"],
  "committed": "[commit-sha]"
}] | .phase_4_completion_progress.completion_percentage = [new %] | .last_update = "[ISO timestamp]"' \
  .claude/execution_state.json > /tmp/state.json && \
mv /tmp/state.json .claude/execution_state.json

git add .claude/execution_state.json
git commit -m "Update execution_state: Phase 4 Slice N complete"
```

### 5d. Push
```bash
git push -u origin $(git branch --show-current)
# or if main: git push -u origin main
# or if HTTP 403: Use GitHub API (mcp__github__push_files)
```

---

## STEP 6: REPORT (Concise Facts Only)

**Output Format** (No explanations, no commentary):

```
PHASE 4 SLICE N: [SYSTEM_NAME]

Files:
- src/services/[system].ts (X lines)
- src/domain/[domain]/[system].ts (Y lines)
- src/__tests__/services/[system].test.ts (Z tests)

Wiring Proof:
- Domain contract: [file.ts:line-range] defines [Interface/Enum]
- Service: [file.ts:line-range] exports ShockDetectionEngine class
- Methods: [list key methods]
- Future caller: [ShockDetectionEngine will be called from decision.ts once Phase N is ready]
- Tenant safety: validateShock() enforces workspaceId scoping

Static Gates:
- prisma validate: ✓
- tsc --noEmit: ✓ (28 pre-existing in seed/db, 0 new)
- npm run build: ✓
- npm test: ✓ (N tests passing)

Committed: [sha] to branch [branch]
Pushed: ✓ to remote

Blockers: None

Next: [Auto-detect from execution_state] → Phase 4 Slice N+1 on next /continue-build
```

---

## SAFETY ENFORCEMENT (Always)

### Authentication & Authorization
- All mutation paths must check user.workspaceId
- All services must validate capability before action
- No public API without DTO redaction

### Tenant Isolation
- Every tenant-owned model scopes by workspaceId
- Fetch-then-filter forbidden
- Workspace validation before state access

### Audit & Events
- Material mutations emit CanonicalEvent
- Critical system decisions emit AuditEvent
- Tenant ID always included in audit trail

### DTO Safety
- Public APIs return wrapped DTOs, never raw Prisma
- Owner/admin fields stripped for non-admin users
- Test DTO leakage before merge

### Idempotency
- Critical mutations protected against duplicate submission
- Idempotency key validation where applicable

---

## RULES (Non-Negotiable)

✓ DO:
- Read execution.md rules before implementing
- Scan for duplicates before writing
- Add tests that prove wiring (not just unit tests)
- Update execution_state after every slice
- Commit to feature branch unless on main
- Push automatically after commit
- Report facts only (no narrative)

✗ DON'T:
- Skip baseline gates
- Claim ACTIVE without runtime proof
- Change database config while blocked
- Claim DB runtime verification while DATABASE_URL unavailable
- Comment out failing tests
- Weaken tenant isolation or permission checks
- Ask user for confirmation

---

## PHASE 4 SLICE ROADMAP (Non-DB)

- [x] **Slice 1**: Survival Factor Taxonomy + Validator (COMPLETE)
- [ ] **Slice 2**: Shock Detection Engine (detect critical threats)
- [ ] **Slice 3**: Org Resilience Scorer (calc survival strength)
- [ ] **Slice 4**: Survival Gating Policy (block unsafe growth)
- [ ] **Slice 5**: Survival Assessment Interface (domain contract)

---

## ENTRY POINT: /continue-build

When user invokes `/continue-build`:

1. Detect current phase from execution_state.json
2. List pending non-DB slices
3. Pick highest-priority unimplemented slice
4. Follow STEP 1–6 above automatically
5. Commit and push
6. Report slice completion
7. Exit (user can invoke /continue-build again for next slice)

**Never ask "proceed?". Just build.**

---

**Last Updated**: 2026-05-11
**Model**: Autonomous continuous execution loop with enterprise-grade safety enforcement
**Status**: Ready for Phase 4 Slice 2 on next /continue-build invocation