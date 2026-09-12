# OPSIQ Integration Strategy

## Critical Finding: Main Branch Has Schema/Code Mismatch

**Issue**: Main branch contains code that references schema fields that don't exist:
- `stage.ts` references `isBlocked` (5 times)
- Schema missing `isBlocked` field
- Schema missing `interventionPhase` field on Engagement

**Impact**: Main build will fail on TypeScript validation

## Branch Assessment

### claude/audit-opsiq-repo-Zf8hu (Audit Branch)
- **Status**: PRIMARY CANDIDATE
- **Prisma Schema**: 616 lines, COMPLETE with blocking fields
- **Diagnosis Service**: 811 lines, COMPREHENSIVE
- **Engines**: All three (Orchestrator, DataValidation, Financial)
- **Intervention State**: blockEngagement/unblockEngagement implemented
- **Schema Fields**: ✓ isBlocked, ✓ interventionPhase, ✓ blockerReason, ✓ blockedAt
- **Recommendation**: **USE AS INTEGRATION BASE**

### integrate/diagnosis-engines-v1 (Diagnosis Branch)
- **Status**: COMPARISON CANDIDATE
- **Prisma Schema**: 543 lines, NO blocking fields
- **Diagnosis Service**: 277 lines, MINIMAL
- **Engines**: All three present
- **Intervention State**: No blocking functions
- **Schema Fields**: ✗ Missing blocking fields
- **Recommendation**: COMPARE diagnosis implementations only

### claude/opsiq-domain-foundation-Y7Cqb (Domain Foundation)
- **Status**: REFERENCE ONLY
- **Status**: Has 295-line schema (too minimal)
- **Recommendation**: SKIP - audit branch is more complete

### claude/opsiq-integration-mainline-rsxNK (Integration Mainline)
- **Status**: REFERENCE FOR HARDENING
- **Schema**: 613 lines, no blocking fields
- **Recommendation**: Check for build/test improvements only

### Wire Pack (opsiq_claude_low_usage_pack_v2_checked.zip)
- **Status**: REFERENCE CONTRACTS ONLY
- **Recommendation**: Extract contracts to docs/contracts if useful

## Integration Plan

1. **Phase 1**: Use claude/audit-opsiq-repo-Zf8hu as primary merge
   - Merge schema, migrations, diagnosis, intervention-state
   - Preserve all business logic from audit branch
   
2. **Phase 2**: Compare diagnosis implementations
   - Extract any improvements from integrate/diagnosis-engines-v1
   - Ensure no duplication of engines
   
3. **Phase 3**: Validate build
   - npx prisma validate
   - npx prisma generate
   - npm run build
   
4. **Phase 4**: Run tests
   - Check for test improvements from integration mainline
   - Ensure all tests pass

## Files to Integrate from Audit Branch

### Schema & Migrations
- prisma/schema.prisma (full 616-line version)
- prisma/migrations/20260424_add_engagement_state_fields/migration.sql

### Services
- src/services/diagnosis.ts (811 lines)
- src/services/intervention-state.ts (444 lines - with blocking functions)
- src/services/stage.ts (audited version)
- src/services/re-evaluation.ts (with engagement_blocked support)

### Engines  
- src/engines/DiagnosisOrchestrator.ts
- src/engines/DataValidationEngine.ts
- src/engines/FinancialEngine.ts
- src/engines/contracts.ts

### API & UI
- src/app/api/diagnosis/route.ts
- src/app/(authenticated)/diagnosis/page.tsx

### Domain Constants
- src/domain/constants/diagnostic-phases.ts
- src/domain/constants/audit-events.ts (with ENGAGEMENT_BLOCKED/UNBLOCKED)

### Tests
- src/app/api/engagements/intervention-routes.test.ts
- src/services/diagnosis.test.ts

## Success Criteria

- [ ] npx prisma validate — PASS
- [ ] npx prisma generate — PASS
- [ ] npm run build — PASS
- [ ] Schema has isBlocked, interventionPhase on Engagement
- [ ] No duplicate implementations of Orchestrator/Engines
- [ ] Diagnosis flow is single, coherent
- [ ] Engagement state is single source of truth in DB
- [ ] Tests pass or documented skipped

## Risk Mitigation

- **Risk**: Schema migration conflicts — **Mitigation**: Create new migration for engagement state fields
- **Risk**: Duplicate engines — **Mitigation**: Keep only audit branch versions
- **Risk**: Diagnosis conflict — **Mitigation**: Compare and select best implementation
- **Risk**: Build failure — **Mitigation**: Validate after each integration step

## Timeline

1. Copy core files from audit branch
2. Validate Prisma
3. Validate build
4. Copy remaining files
5. Final validation
6. Commit if all pass
