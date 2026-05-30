# Canonical Wrapper Route Audit

## Executive Summary

Found 52 routes using `withCanonicalEnforcement` that return `Response.json()` to a wrapper expecting plain objects.

This is a **widespread architectural issue**, not just the `/api/engagements` bug.

## Classification

### Fixed
- ✅ `app/api/engagements/route.ts` - Returns plain object (fix applied)

### Violations Found (52 routes)
- All violations follow same pattern: Handler returns `Response.json()` which wrapper JSON.stringify() serializes incorrectly

### Examples
- `app/api/actions/[actionId]/route.ts`
- `app/api/clients/[clientId]/route.ts`
- `app/api/decisions/[decisionId]/route.ts`
- `app/api/intelligence/insights/route.ts`
- `app/api/users/route.ts`
- ... and 47 more

## Root Cause
The canonical wrapper at `src/lib/canonical-route-enforcement.ts` line 631 does:
```typescript
return new NextResponse(JSON.stringify(result), { status: 200, headers: {...} });
```

It expects `result` to be a plain serializable object, but many handlers return `Response.json()` which:
1. Wrapper receives Response object
2. `JSON.stringify(Response)` serializes the Response's own properties, not its body
3. Result is empty or malformed

## Fix Pattern
Change all violations from:
```typescript
return Response.json({ data: ... });
```

To:
```typescript
return { data: ... };
```

The wrapper handles JSON serialization.

## Risk Assessment
- **Low risk to fix**: This is consistent refactoring across all affected routes
- **High risk to leave unfixed**: All 52 routes may return malformed responses under certain conditions
- **Scope**: Large, requires coordinated update to 52 route files

## Recommendation
Create a separate task to systematically fix all 52 violations:
1. Update wrapper documentation to enforce plain object requirement
2. Create automated fixer script to batch-replace violations
3. Add CI gate to prevent new violations
4. Fix routes incrementally in order of traffic/criticality

## Immediate Action (This Fix)
Only `/api/engagements` fixed in this session because:
- It's the proven production blocker
- Broader refactor deferred to separate task
- Risk of breaking 51 other routes if fixed in same PR
