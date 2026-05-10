# AUDIT BUILD: Hostile Enterprise Deployment Audit
# Phases 1–13 Truth Verification & Non-DB Breakage Fix

**Framework**: Read execution.md + execution_state.json → Scan repo → Verify claims → Detect breakage → Fix non-DB errors only → Classify blockers → Report verdict

---

## AUDIT MISSION

**NOT** a feature or implementation pass. **IS** a verification pass to:
1. Detect false ACTIVE claims (systems that claim runtime but have no proof)
2. Detect parked/obsolete systems (implemented but not integrated, or superseded)
3. Detect safety violations (auth, workspace isolation, DTO leaks, audit gaps)
4. Fix only non-DB breakage (TS errors, build fails, missing dependencies)
5. Block DB-dependent claims if DATABASE_URL unavailable
6. Classify remaining blockers for triage

---

## ENTRY POINT: /audit-build

When user invokes `/audit-build`:

1. Detect current phase from execution_state.json
2. Scan repo for ALL implemented systems (services, domain contracts, policies)
3. Verify each claimed ACTIVE system against runtime proof
4. Run static gates (tsc, build, tests)
5. Scan for anti-patterns (conflicts, fake TODOs, DTO leaks, unscoped queries)
6. Fix only non-DB errors
7. Update execution_state with audit findings
8. Commit and push
9. Report verdict only (no narrative)

**Never add features. Never ask confirmation. Fix only non-DB breakage.**

---

## STEP 1: PRE-AUDIT SETUP (Automatic)

### 1a. Repository Health
```bash
git status                              # Confirm clean or recent commits
git branch                              # Note current branch
git log --oneline -n 5                  # Confirm history coherence
```
**STOP IF**: Merge conflicts or uncommitted work unrelated to audit → resolve first

### 1b. Environment Check
```bash
echo "DATABASE_URL available: $([ -z "$DATABASE_URL" ] && echo "NO" || echo "YES")"
echo "Node version: $(node -v)"
echo "npm version: $(npm -v)"
```

### 1c. Read Contract Truth
```bash
cat execution.md | head -100              # Contract definitions
cat .claude/execution_state.json | jq '.' # Current phase + status
```

Extract:
- Current phase
- List of ACTIVE systems (should be in execution_state.current_phase or phase_N_status)
- List of claimed implementations
- DB availability status

---

## STEP 2: REPO SCAN FOR SYSTEMS (Automatic)

### 2a. Find All Implemented Services
```bash
echo "=== SERVICES ===" && \
find src/services -name "*.ts" -not -path "*/node_modules/*" | sort

echo "=== DOMAIN CONTRACTS ===" && \
find src/domain -name "*.ts" -not -path "*/node_modules/*" | sort

echo "=== POLICIES ===" && \
find src/policies -name "*.ts" -not -path "*/node_modules/*" 2>/dev/null | sort || echo "(none found)"

echo "=== EXISTING TESTS ===" && \
find src/__tests__/services src/__tests__/domain -name "*.test.ts" 2>/dev/null | wc -l
```

### 2b. Classify Each System
For every service/domain/policy found:
```bash
# Example: OrgResilienceScorer
grep -r "class OrgResilienceScorer" src/services/
grep -r "export.*OrgResilienceScorer" src/
grep -r "OrgResilienceScorer" src/graphql/ src/pages/ 2>/dev/null || echo "(no integration yet)"
grep -r "OrgResilienceScorer" .claude/execution_state.json
```

**Classification**:
- ACTIVE: Implemented + integrated into production path (graphql mutation, page, API route)
- WIRED_NOT_CALLED: Implemented + integrated but no usage yet (reserved for future caller)
- PARKED: Implemented but not integrated anywhere
- OBSOLETE: Superseded by newer implementation, should be deleted

Record each finding in audit report.

### 2c. Cross-Check Against execution_state.json
```bash
echo "=== CLAIMED ACTIVE SYSTEMS ===" && \
jq '.phase_[N]_systems_status.active_systems // .phase_[N]_status.active_systems // []' .claude/execution_state.json | jq -r '.[]'

echo "=== IMPLEMENTED SLICES ===" && \
jq '.phase_[N]_systems_status.implemented_slices // []' .claude/execution_state.json | jq -r '.[] | .slice'
```

**Verification Rule**:
- If execution_state claims system X is ACTIVE → grep for X in production code
- If no prod integration found → Mismatch: reclassify as PARKED
- If prod integration found but not in execution_state → Update execution_state

---

## STEP 3: SAFETY VERIFICATION (Scan-Only)

### 3a. Auth & Workspace Isolation
```bash
echo "=== CHECKING TENANT ISOLATION ===" && \
grep -r "workspaceId" src/services/ src/domain/ | grep -v "test.ts" | wc -l && \
echo "Workspace checks found above. Sample:" && \
grep -r "if (!workspaceId)" src/services/ | head -3

echo "=== CHECKING USER CAPABILITY VALIDATION ===" && \
grep -r "validateCapability\|authorize\|canPerform" src/policies/ src/services/ 2>/dev/null | wc -l || echo "(no matches)"

echo "=== CHECKING FOR UNSCOPED QUERIES ===" && \
grep -r "prisma\.\w\+\.findMany()" src/services/ 2>/dev/null | grep -v "workspaceId" | head -3 || echo "(no unscoped findMany found)"
```

**Safety Rule**:
- Every tenant-owned fetch must include workspaceId in where clause
- Every write must validate user.capability against operation
- Every audit event must include workspaceId + userId

### 3b. DTO & Export Safety
```bash
echo "=== CHECKING FOR DTO WRAPPING ===" && \
grep -r "return.*prisma" src/graphql/resolvers src/api/routes 2>/dev/null | head -3 || echo "(no direct Prisma leaks found)"

echo "=== CHECKING PUBLIC API REDACTION ===" && \
grep -r "export.*interface.*Response" src/domain/ | head -5 || echo "(no DTO interfaces found)"

echo "=== CHECKING FOR SENSITIVE FIELD EXPORTS ===" && \
grep -r "password\|secret\|token\|apiKey" src/graphql/types src/api/responses 2>/dev/null | head -3 || echo "(no sensitive field leaks detected)"
```

**DTO Rule**:
- Public APIs return wrapped DTOs, never raw Prisma models
- Admin/owner fields stripped for non-admin users
- Test every public API for DTO leakage

### 3c. Audit Event Coverage
```bash
echo "=== CHECKING AUDIT EVENT EMISSION ===" && \
grep -r "AuditEvent\|emit.*Event\|logAudit" src/services/ src/policies/ | grep -v "test.ts" | wc -l && \
echo "Audit events found. Critical mutations should emit events:" && \
grep -r "class.*Scorer\|class.*Engine\|class.*Validator" src/services/ | head -3 | while read f; do
  file=$(echo "$f" | cut -d: -f1)
  echo "  $file: $(grep -c 'emit\|Event' "$file") event mentions"
done
```

**Audit Rule**:
- Every material mutation (score change, shock detection, status change) emits AuditEvent
- Every critical decision (gating, recommendation) emits AuditEvent
- Audit trail includes workspaceId + userId + timestamp

### 3d. Cache & Consistency
```bash
echo "=== CHECKING FOR CACHE CONSISTENCY ISSUES ===" && \
grep -r "cache\|Cache\|memo\|Memo" src/services/ | grep -v "test.ts" | grep -v ".map" | head -3 || echo "(no explicit cache found)"

echo "=== CHECKING FOR STALE DATA PATTERNS ===" && \
grep -r "last_measured_at\|assessedAt\|as_of" src/domain/ | head -3 || echo "(no timestamp fields detected)"
```

---

## STEP 4: RUNTIME WIRING VERIFICATION (Active Systems Only)

### 4a. For Each ACTIVE System: Prove Caller
```bash
# Example: If OrgResilienceScorer claimed ACTIVE:
echo "=== SEARCHING FOR ORGRESILIENCESCORER USAGE ===" && \
grep -r "OrgResilienceScorer\." src/graphql/ src/api/ src/pages/ src/pages/api/ 2>/dev/null | head -5

# If no results: OrgResilienceScorer is not ACTIVE, reclassify as PARKED/WIRED_NOT_CALLED
```

**Wiring Proof Rule**:
- ACTIVE: Method call found in production resolver/route/mutation → System is truly live
- WIRED_NOT_CALLED: Type import found but no method call → System is ready but unused
- PARKED: No imports, no references → System is dead code

### 4b. Database-Dependent Claims
```bash
echo "DATABASE_URL status: $([ -z "$DATABASE_URL" ] && echo "UNAVAILABLE" || echo "AVAILABLE")"

if [ -z "$DATABASE_URL" ]; then
  echo "DB unavailable. Blocking claims that require:"
  echo "  - Prisma queries (findUnique, findMany, create, update)"
  echo "  - Migration verification"
  echo "  - Runtime schema validation"
  echo ""
  echo "Allowed claims:"
  echo "  - Pure TypeScript services (no DB calls)"
  echo "  - Domain contracts (interfaces, types, enums)"
  echo "  - Client-side validation"
fi
```

**DB Rule**:
- If DATABASE_URL unavailable: mark all DB-dependent systems as DB_BLOCKED
- Non-DB systems (Validators, Scorers, Detectors, Policies) can be verified
- Never claim DB runtime verification while DB unavailable

---

## STEP 5: STATIC GATES (Sequential, Stop on First Fail)

### 5a. Gate 1: Dependency Health
```bash
echo "=== GATE 1: npm ci ===" && \
npm ci 2>&1 | tail -5 && echo "✓ PASS" || { echo "✗ FAIL"; exit 1; }
```

### 5b. Gate 2: Prisma Schema Validity
```bash
echo "=== GATE 2: npx prisma validate ===" && \
npx prisma validate 2>&1 | grep -E "(valid|error)" && echo "✓ PASS" || echo "⚠ PRISMA WARNING (may be db-blocked)"
```

### 5c. Gate 3: TypeScript Compilation
```bash
echo "=== GATE 3: npx tsc --noEmit ===" && \
ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "error TS") && \
if [ "$ERRORS" -eq 0 ]; then
  echo "✓ PASS (0 TypeScript errors)"
else
  echo "✗ FAIL ($ERRORS TypeScript errors found)"
  npx tsc --noEmit 2>&1 | head -20
  exit 1
fi
```

### 5d. Gate 4: Build Success
```bash
echo "=== GATE 4: npm run build ===" && \
npm run build 2>&1 | tail -10 && echo "✓ PASS" || { echo "✗ FAIL: Build error"; exit 1; }
```

### 5e. Gate 5: Targeted Non-DB Tests
```bash
echo "=== GATE 5: npm test (non-DB) ===" && \
npm test -- src/__tests__/services/ src/__tests__/domain/ --testPathIgnorePatterns="db|prisma|integration" 2>&1 | tail -20
TEST_RESULT=$?
if [ $TEST_RESULT -eq 0 ]; then
  echo "✓ PASS"
else
  echo "⚠ TEST FAILURES (audit before fix)"
fi
```

---

## STEP 6: ANTI-PATTERN SCANNING (Hostile Mode)

### 6a. Conflict Markers
```bash
echo "=== SCANNING FOR MERGE CONFLICTS ===" && \
grep -r "^<<<<<<<\|^=======\|^>>>>>>>" src/ .claude/ 2>/dev/null | wc -l | awk '{if ($1 > 0) print "✗ FAIL: " $1 " conflict markers found"; else print "✓ PASS (0 conflicts)"}'
```

### 6b. Fake TODO Comments (Indicate False ACTIVE Claims)
```bash
echo "=== SCANNING FOR FAKE-ACTIVE PATTERNS ===" && \
grep -r "TODO.*ACTIVE\|FIXME.*implement\|HACK.*wiring\|XXX.*runtime" src/ --include="*.ts" | wc -l | awk '{if ($1 > 0) print "⚠ FOUND: " $1 " suspicious TODOs"; else print "✓ PASS (0 suspicious)"}'
```

### 6c. Unscoped Database Queries
```bash
echo "=== SCANNING FOR UNSCOPED QUERIES ===" && \
grep -r "prisma\.\w\+\.find\|prisma\.\w\+\.update\|prisma\.\w\+\.delete" src/services/ src/policies/ 2>/dev/null | grep -v "workspaceId\|tenant" | wc -l | awk '{if ($1 > 0) print "✗ FAIL: " $1 " unscoped queries"; else print "✓ PASS (0 unscoped)"}'
```

### 6d. Public DTO Leaks
```bash
echo "=== SCANNING FOR DTO LEAKS ===" && \
grep -r "export.*type.*Response\|return.*prisma\.\w\+$" src/graphql/resolvers src/api/ 2>/dev/null | wc -l | awk '{if ($1 > 0) print "⚠ FOUND: " $1 " potential DTO leaks"; else print "✓ PASS (0 direct leaks)"}'
```

### 6e. Missing Tenant Validation
```bash
echo "=== SCANNING FOR MISSING WORKSPACE CHECKS ===" && \
SERVICES=$(find src/services src/policies -name "*.ts" -type f | grep -v test.ts | wc -l) && \
CHECKS=$(grep -r "if.*!workspaceId\|validateTenant\|requireWorkspace" src/services src/policies --include="*.ts" | wc -l) && \
echo "Services with logic: $SERVICES, Workspace checks: $CHECKS" && \
if [ "$CHECKS" -lt "$SERVICES" ]; then
  echo "⚠ POSSIBLE GAP: Not all services validate workspace"
else
  echo "✓ PASS: Tenant checks present"
fi
```

---

## STEP 7: FIX NON-DB BREAKAGE (Automatic)

### 7a. Classification: What to Fix
```
FIX NOW (NON_DB_FIX_NOW):
- TypeScript errors (syntax, type mismatches)
- Missing imports or exports
- Build errors in non-DB code
- Broken test suites (non-DB)
- Unused/dead code causing compilation errors
- Conflicting service definitions (duplicates)

DO NOT FIX (DB_BLOCKED or out-of-scope):
- Prisma schema errors (DATABASE_URL unavailable)
- Database migration issues
- Runtime DB connection errors
- DB-dependent test failures (if DB unavailable)
- Feature gaps (not breakage)
```

### 7b. Fix Identified Errors
For each error classified NON_DB_FIX_NOW:
```bash
# Example: Remove conflicting duplicate system
rm src/services/duplicate-scorer.ts

# Example: Fix import path
sed -i 's|@/types/old-import|@/domain/new-import|g' src/services/*.ts

# Example: Delete dead TODOs blocking compilation
sed -i '/^.*TODO.*implement.*$/d' src/services/example.ts
```

**Rules**:
- Fix only compilation/runtime errors, not warnings
- Delete duplicates/obsolete systems if preventing build
- Fix imports/exports to resolve unmet dependencies
- Do not refactor, do not add features
- Do not touch database schema or config

### 7c. Verify Fixes
```bash
echo "=== RE-RUNNING GATES AFTER FIXES ===" && \
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l && \
npm run build 2>&1 | tail -3
```

---

## STEP 8: UPDATE EXECUTION STATE (Findings Only)

### 8a. Record Audit Findings
```bash
jq '.audit_findings = {
  "scan_date": "'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'",
  "phase": .current_phase,
  "active_systems_verified": 0,
  "parked_systems_found": 0,
  "duplicate_systems_removed": 0,
  "safety_gaps_fixed": 0,
  "non_db_errors_fixed": 0,
  "db_blocked_systems": 0,
  "next_audit_action": "manual"
} |
.last_audit_run = "'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'" |
.audit_status = "COMPLETE"
' .claude/execution_state.json > /tmp/audit.json && \
mv /tmp/audit.json .claude/execution_state.json
```

### 8b. Example Entries
```json
{
  "audit_findings": {
    "scan_date": "2026-05-10T14:30:00Z",
    "active_systems_verified": 3,
    "parked_systems_found": 1,
    "duplicate_systems_removed": 0,
    "safety_gaps_fixed": 0,
    "non_db_errors_fixed": 2,
    "db_blocked_systems": 0,
    "issues": [
      {
        "type": "PARKED_SYSTEM",
        "system": "OldSurvivalScorer",
        "file": "src/services/old-scorer.ts",
        "action": "DELETE: superseded by OrgResilienceScorer"
      },
      {
        "type": "TS_ERROR",
        "file": "src/services/shock-detection-engine.ts",
        "error": "Type 'string' not assignable to type 'ShockState'",
        "fixed": true
      }
    ]
  }
}
```

---

## STEP 9: COMMIT & PUSH

### 9a. Verify Clean State
```bash
git status --short
git diff --stat
```

### 9b. Stage Audit Changes
```bash
git add -A .claude/execution_state.json

# Only add fixed source files (deletion, import fixes)
git add src/services/ src/domain/ src/policies/ 2>/dev/null || true
```

### 9c. Commit Audit Results
```bash
git commit -m "Audit Phase N: Verify claims + fix non-DB breakage

Findings:
- Active systems verified: X (runtime proof found)
- Parked systems found: Y (reclassified in execution_state)
- Duplicate systems removed: Z
- Safety gaps fixed: W (workspace, auth, DTO)
- Non-DB errors fixed: V

Fixes applied:
- Removed duplicate/obsolete: [list files]
- Fixed TypeScript errors: [count]
- Fixed import paths: [count]
- Added missing workspace checks: [count]

Blockers:
- DB_BLOCKED: [systems] (DATABASE_URL unavailable)
- NON_DB_FIX_NOW: None remaining

Static gates:
- npm ci: ✓
- prisma validate: ✓ (or ⚠ db-blocked)
- tsc --noEmit: ✓ (0 new errors)
- npm run build: ✓
- npm test: ✓ (non-DB suite)

https://claude.ai/code/[SESSION_ID]"
```

### 9d. Push
```bash
git push -u origin $(git branch --show-current)
```

---

## STEP 10: AUDIT REPORT (Facts Only, No Narrative)

**Output Format**:

```
AUDIT PHASE N: [PHASE_NAME]

Scan Results:
- Total systems found: X
- Active (runtime proof): Y
- Wired (integrated, not called): Z
- Parked (implemented, not integrated): W
- Obsolete (superseded): V

Verification Status:
✓ Auth & workspace isolation: [sample checks]
✓ DTO safety: [no direct leaks found / X issues found]
✓ Audit coverage: [X events emitted]
✓ Tenant isolation: [all services validate workspaceId]

Static Gates:
✓ npm ci: PASS
✓ npx prisma validate: PASS (or ⚠ DB unavailable)
✓ npx tsc --noEmit: PASS (0 new TypeScript errors)
✓ npm run build: PASS
✓ npm test: PASS (N tests passing)

Anti-Pattern Scan:
- Conflict markers: 0 found ✓
- Fake-ACTIVE TODOs: 0 found ✓
- Unscoped queries: 0 found ✓
- Public DTO leaks: 0 found ✓

Mismatches (Active vs Actual Integration):
[List any systems claimed ACTIVE but with no prod callers]

Fixes Applied:
- Deleted: [obsolete systems]
- Fixed: [non-DB errors, imports, workspace checks]
- Count: X files modified, Y deletions, Z additions

Blockers:
- NON_DB_FIX_NOW: None
- DB_BLOCKED: [systems requiring DATABASE_URL]

Audit Verdict:
[CLEAN] All claims verified, no non-DB breakage
[FIXABLE] N non-DB errors fixed, no remaining breaks
[NEEDS_DB] X systems blocked pending DATABASE_URL

Committed: [sha] to branch [current-branch]
Pushed: ✓ to remote

Next Action: [Auto-resume /continue-build for next slice, or manual triage for DB_BLOCKED systems]
```

---

## RULES (Non-Negotiable)

✓ DO:
- Scan before fixing (never assume)
- Fix only non-DB breakage
- Verify every ACTIVE claim against prod code
- Update execution_state with findings
- Commit all fixes
- Report facts only (verdict + gates + files + blockers)

✗ DON'T:
- Add features or refactorings
- Change database schema or config
- Comment out failing tests
- Claim DB verification while DATABASE_URL unavailable
- Claim systems ACTIVE without runtime proof
- Ask user for confirmation
- Fix issues marked DB_BLOCKED

---

## ENTRY POINT BEHAVIOR

When user invokes `/audit-build`:

1. Run STEP 1–2 (scan repo, classify systems)
2. Run STEP 3 (safety verification)
3. Run STEP 4 (wiring proof for ACTIVE systems only)
4. Run STEP 5 (static gates)
5. Run STEP 6 (anti-pattern scanning)
6. Run STEP 7 (fix non-DB breakage)
7. Run STEP 8 (update execution_state)
8. Run STEP 9 (commit and push)
9. Run STEP 10 (report verdict)
10. Exit

**Never ask "proceed?". Never add features. Fix breakage only.**

---

**Last Updated**: 2026-05-10
**Model**: Hostile enterprise audit with non-DB fix-only scope
**Status**: Ready for /audit-build invocation
