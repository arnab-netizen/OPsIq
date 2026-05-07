# Branch Protection Rules for Phase 0 Stability

**Effective**: Post Phase 0 Support Hardening merge  
**Scope**: main branch (Phase 0 canonical)  
**Enforcement**: GitHub Actions + CODEOWNERS

## Required Branch Protection Settings

### 1. Require Status Checks Pass Before Merge
- ✓ Preflight (Environment check)
- ✓ Build & TypeScript (Compilation)
- ✓ Unit Tests (Contract validation)
- ✓ Prisma Validate (Schema integrity)
- ✓ Ignored Tests Count Check (no increase)

**Rationale**: Phase 0 stability requires all gates to pass. No exceptions for quick merges.

### 2. Block Force Push to main
- **Allow force pushes**: NO
- **Reason**: Phase 0 is immutable. Force pushes destroy audit trail and can bypass CI.

### 3. Require Pull Request Reviews
- **Number of reviews**: 1
- **Dismiss stale reviews**: YES (if new commits added)
- **Require code owner review**: YES (see CODEOWNERS below)

**Rationale**: Contract changes require expert review. No auto-merge without human verification.

### 4. Require Branches to be Up to Date
- **Enforce**: YES
- **Allows dismissal**: NO

**Rationale**: Prevents merge conflicts and ensures all tests pass against latest main.

### 5. Block Bypass of Required Checks
- **Allow administrators to bypass**: NO
- **Allow dismissal by push**: NO

**Rationale**: Administrators cannot bypass Phase 0 gates. Contract immutability non-negotiable.

### 6. Require Conversation Resolution
- **Require approval of discussions**: YES
- **Dismiss approvals when new commits added**: YES

---

## CODEOWNERS Configuration

File: `.github/CODEOWNERS`

```
# Phase 0 Canonical Contracts
src/contracts/                          @phase-0-steward
src/__tests__/critical-service-contracts.test.ts @phase-0-steward

# Authentication & Authorization
src/services/auth.ts                    @auth-steward
src/services/auth-api.ts                @auth-steward
src/lib/auth-guard.ts                   @auth-steward

# Database & Schema
prisma/schema.prisma                    @db-steward
prisma/migrations/                      @db-steward
.env.example                            @db-steward

# CI & Deployment
.github/workflows/                      @ops-steward
scripts/                                @ops-steward
```

**Roles**:
- **@phase-0-steward**: Contract layer (canonical, immutable)
- **@auth-steward**: Authentication paths (security-critical)
- **@db-steward**: Database schema (backward compatibility required)
- **@ops-steward**: Deployment & CI (operational safety)

---

## Merge Checklist

Before merging any PR to main:

- [ ] All status checks pass in CI
- [ ] At least 1 code owner approved (from relevant CODEOWNERS)
- [ ] No stale reviews present
- [ ] Branch is up to date with main
- [ ] No force push history
- [ ] Conversation threads resolved

---

## Enforcement via CI

GitHub Actions will verify:
1. **No force push**: Block merge if commits rewritten
2. **Status checks**: All required jobs must pass
3. **Code owner approval**: CODEOWNERS rules enforced
4. **Contract immutability**: See PHASE B below

---

## Exceptions & Escalation

**Emergency Merge** (hotfix for production outage):
1. Notify @phase-0-steward
2. Provide incident context & justification
3. Must still pass all CI gates (no override)
4. Create post-incident review within 48 hours

**Contract Change** (breaking change to Phase 0):
- NOT PERMITTED without new major release
- Must go through formal RFC process
- Requires all code owner approval (not just one)
- Update PHASE B CI rules accordingly

---

## Review & Audit

- **Monthly**: Review protection settings and CODEOWNERS
- **Quarterly**: Audit branch history for compliance
- **Annually**: Review effectiveness and update if needed
