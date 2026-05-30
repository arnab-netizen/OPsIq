# Diagnostic Endpoints Cleanup Plan

Production smoke test is now passing. These diagnostic endpoints were added to identify the root cause. This document tracks cleanup.

## Endpoints to Clean Up

### 1. `/api/internal/build-info`
- **Purpose**: Return git commit hash for deployed code verification
- **Protected**: Yes, diagnostic key required
- **Mutates DB**: No
- **Safe Output**: Yes (only git info, no secrets)
- **Keep Temporarily**: Yes
- **Remove After**: 3 clean production smoke passes
- **Risk if Left**: Minimal - read-only, safe output
- **Required Action**: Remove after stability confirmed

### 2. `/api/internal/demo-permission-proof`
- **Purpose**: Verify demo user has required role assignment
- **Protected**: Yes, diagnostic key required
- **Mutates DB**: Yes (POST creates/updates UserRoleAssignment)
- **Safe Output**: Yes (masked IDs, no secrets)
- **Keep Temporarily**: Yes
- **Remove After**: 5 clean production smoke passes
- **Risk if Left**: Creates UserRoleAssignment on demand (recovery tool)
- **Required Action**: Decide: keep as permanent recovery tool or remove

### 3. `/api/internal/demo-engagement-proof`
- **Purpose**: Verify demo engagement exists with correct visibility
- **Protected**: Yes, diagnostic key required
- **Mutates DB**: Yes (POST creates/updates demo engagement)
- **Safe Output**: Yes (masked IDs, no secrets)
- **Keep Temporarily**: Yes
- **Remove After**: 5 clean production smoke passes
- **Risk if Left**: Creates demo engagement on demand (recovery tool)
- **Required Action**: Decide: keep as permanent recovery tool or remove

### 4. `/api/internal/engagements-api-runtime-trace`
- **Purpose**: Compare raw DB count, service filter, wrapper response
- **Protected**: Yes, diagnostic key required
- **Mutates DB**: No
- **Safe Output**: Yes (masked IDs, classification only)
- **Keep Temporarily**: Yes
- **Remove After**: 3 clean production smoke passes
- **Risk if Left**: Minimal - read-only, diagnostic-only output
- **Required Action**: Remove or archive for future debugging reference

### 5. `/api/internal/debug-engagements-p2007`
- **Purpose**: Diagnose Prisma P2007 errors on engagement queries
- **Protected**: Yes, diagnostic key required
- **Mutates DB**: No
- **Safe Output**: Yes (no secrets, no stack traces)
- **Keep Temporarily**: Yes
- **Remove After**: 2 clean production smoke passes
- **Risk if Left**: Minimal - read-only, diagnostic output
- **Required Action**: Remove once P2007 is confirmed resolved

## Cleanup Schedule

### Immediate (After This Fix)
- ✅ Leave all diagnostic endpoints in place
- ✅ Smoke now passes with `/api/engagements` returning correct data

### After 2 Clean Smokes (Next 24h)
- [ ] Can remove `/api/internal/debug-engagements-p2007`

### After 3 Clean Smokes (Next 36h)
- [ ] Can remove `/api/internal/build-info`
- [ ] Can remove `/api/internal/engagements-api-runtime-trace`

### After 5 Clean Smokes (Next 48h)
- [ ] Decide: Keep `/api/internal/demo-permission-proof` (recovery tool) or remove
- [ ] Decide: Keep `/api/internal/demo-engagement-proof` (recovery tool) or remove

## How to Track Clean Smokes
- Smoke runs automatically in Vercel/CI on each deploy to main
- Each successful smoke = 1 clean smoke
- Track in production monitoring dashboard

## Cleanup Procedure
When ready to remove an endpoint:
1. Delete the route file: `src/app/api/internal/{endpoint-name}/route.ts`
2. Remove from backup documentation
3. Test: `npm run build` passes
4. Commit: `chore: remove diagnostic endpoint {endpoint-name}`
5. Deploy

## Decision Log
- [ ] 2026-05-30: All endpoints added for production root cause debugging
- [ ] YYYY-MM-DD: Decision on demo-permission-proof: keep/remove
- [ ] YYYY-MM-DD: Decision on demo-engagement-proof: keep/remove
- [ ] YYYY-MM-DD: All cleanup complete
