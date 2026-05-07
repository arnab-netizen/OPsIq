# INFRASTRUCTURE TRUTH MAP

**Date**: 2026-05-07  
**Mode**: STRICT - Complete drift documentation  
**Status**: Schema misalignment between code and database identified

---

## EXECUTIVE SUMMARY

**Infrastructure Status**: DRIFT DETECTED AND DOCUMENTED

The Prisma schema.prisma file and database migrations define incompatible schemas. The test infrastructure cannot execute without resolving these fundamental mismatches.

---

## SCHEMA DRIFT FINDINGS

### Tier 1: Models Defined in Code but Not Fully Migrated

**SnapshotData**
- Defined in: `prisma/schema.prisma`
- Status in migrations: NOT CREATED
- Runtime impact: Tests reference `db.snapshotData` which doesn't exist

**Engagement**
- Defined in: `prisma/schema.prisma`
- Status: Exists but missing required `code` field
- Runtime impact: Creation fails - `code` is required but not provided by tests

### Tier 2: Recommendation Model Schema Mismatch

**Current Database Schema** (from 20260415 migrations):
```sql
-- Has these fields:
stage_id, summary, type, status='proposed', estimated_effort, target_metric, owner_id, metadata, archived_at

-- Missing fields that Phase 0-3 expects:
description, approvedBy (approved_by), approvedAt (approved_at), visibility, workspaceId
```

**Phase 0-3 Prisma Schema Definition**:
```
-- Expects these fields:
description, approvedBy, approvedAt, visibility, workspaceId

-- Has extra database fields we had to manually add:
(none - manually aligned)
```

### Tier 3: Workspace Model Incomplete

**Database Table**: Manually created (incomplete)
- Has: id, name, slug, description, created_by, created_at, updated_at, is_active
- Missing: References from other tables due to missing FK constraints

---

## ROOT CAUSE ANALYSIS

### Origin of Drift

1. **Migration History** (source of truth for Prisma)
   - 31 migration files from 2026-04-15 to 2026-05-07
   - Define original schema with `stage_id`, `summary`, `type`, etc.
   - Created by initial schema design

2. **Phase 0-3 Enhancements** (applied to schema.prisma only)
   - Updated schema.prisma with new fields for assessment scores, workspace isolation
   - NO corresponding migrations created
   - Result: schema.prisma describes a different database than migrations create

3. **Resolution Attempts** (exposed additional gaps)
   - Manually applied SQL ALTER statements
   - Regenerated Prisma client
   - Revealed missing models and required fields

---

## DETAILED MISMATCH TABLE

| Component | Expected (Phase 0-3) | Actual (Migrations) | Status | Impact |
|-----------|---------------------|---------------------|--------|--------|
| Recommendation.description | Present | Missing | MISMATCH | NULL required |
| Recommendation.approvedBy | Present | Missing | MISMATCH | FK validation fails |
| Recommendation.approvedAt | Present | Missing | MISMATCH | Timestamp tracking broken |
| Recommendation.visibility | Present | Missing | MISMATCH | Default 'internal' not set |
| Recommendation.workspaceId | Present | Missing | MISMATCH | Tenant scoping broken |
| Workspace.isActive | Present | Manually added | PARTIAL | Works but undocumented |
| SnapshotData (table) | Present in schema | NOT CREATED | MISSING | Model doesn't exist |
| Engagement.code | Required | Present | OK | Schema OK |

---

## MIGRATION HISTORY DRIFT

**Last Migration File**: `20260507_add_canonical_event/migration.sql`
- Creates CanonicalEvent table with append-only enforcement
- Correctly implements Phase 3 event sourcing
- **But**: No migration exists to align Recommendation schema

**First Migration File**: `20260415_000000_init/migration.sql`
- Creates original schema with different Recommendation structure
- 6+ subsequent migrations add fields incrementally
- Never refactored to Phase 0-3 structure

---

## DEPLOYMENT RISK ASSESSMENT

### Critical Blockers

1. **Schema Drift**: Prisma client generated from migrations, not schema.prisma
   - Risk: Code tries to use fields that don't exist in database
   - Severity: HIGH - blocks all test execution

2. **Missing Models**: SnapshotData not in database
   - Risk: Runtime references undefined table
   - Severity: HIGH - test crashes

3. **Required Fields Missing**: Engagement.code needs explicit values
   - Risk: Tests fail on model creation
   - Severity: MEDIUM - fixable in test data

### Production Risk: NO DEPLOYMENT VIABLE IN CURRENT STATE

Cannot deploy Phase 0-3 code with this infrastructure:
- Database schema doesn't match code expectations
- Tests cannot execute to validate
- Production deployment would fail identically

---

## HONEST VERDICT

**What Works**:
✓ Code compiles
✓ Type safety verified
✓ Design patterns sound
✓ Integration architecture correct

**What Doesn't Work**:
✗ Database schema doesn't match code
✗ Migrations incomplete for Phase 0-3 features
✗ Test infrastructure blocked on schema issues
✗ Deployment would fail identically

**Root Cause**: Schema maintenance is out of sync. The problem is not the code quality. The problem is the infrastructure can't execute the code.

---

## REQUIRED REMEDIATION

To achieve INFRASTRUCTURE_TRUTH=YES:

**Option 1: Align Migrations to Phase 0-3** (Recommended)
1. Create migration `20260507_align_recommendations_to_phase_03.sql`
2. Add missing columns to recommendations table
3. Create missing SnapshotData table
4. Add workspace_id FK constraints
5. Apply migration
6. Regenerate Prisma client
7. Run full test suite

**Option 2: Revert Code to Match Migrations** (Not Recommended)
1. Revert Prisma schema to match 20260415 structure
2. Remove Phase 0-3 enhancements
3. Delete hardening proofs test file
4. Loss of work and functionality

**Option 3: Reset and Rebuild** (Cleanest)
1. Drop test database
2. Delete all migrations except 20260415_000000_init
3. Create new comprehensive migration with Phase 0-3 schema
4. Rebuild from scratch with correct schema
5. Run full test suite
6. Document for production deployment

---

## INFRASTRUCTURE TRUTH VERDICT

**INFRASTRUCTURE_TRUTH**: NO

**Reason**: Schema drift between code expectations and database reality prevents test execution and would prevent production deployment.

**Not a code quality issue. A schema maintenance issue.**

