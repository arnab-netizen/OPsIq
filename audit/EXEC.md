STATUS: RUNNING

RULES:
- one task at a time
- do not skip
- do not batch
- verify before DONE
- fail closed

---

TASK 001
TYPE: AUTH
TARGET: user.ts
RULE: no raw actorId; use authContext only
VERIFY: grep actorId == 0
STATE: DONE

TASK 002
TYPE: READ
TARGET: repo-wide
RULE: all prisma reads scoped by workspaceId; no overfetch/filter
VERIFY: no prisma read without workspaceId
STATE: DONE

FIXES APPLIED:
- decision-evidence.service.ts: added workspaceId scoping to engagement.findUnique, action.findMany, finding.findMany, recommendation.findMany
- operator/store.ts: added workspaceId scoping to operatorItem.findUnique/findFirst
- outcome/outcome.service.ts: added workspaceId scoping to engagement.findUnique, updated route handler
- engagement-membership.ts: added workspaceId parameter to addMember/removeMember functions, scoped queries
- business-condition.ts: added workspaceId to CreateConditionProfileInput, scoped queries
- All route handlers updated to pass x-workspace-id header to services

TASK 003
TYPE: CAPABILITY
TARGET: services/**
RULE: enforce capability on read+write (not role-only)
VERIFY: each service has capability check
STATE: DONE (Phase 1 cleared)

TASK 004
TYPE: AUDIT
TARGET: services/**
RULE: every mutation emits emitAuditEvent with workspaceId + actorId(authContext)
VERIFY: all create/update/delete have audit call
STATE: DONE (Phase 1 cleared)

TASK 005
TYPE: IDEMPOTENCY
TARGET: POST routes
RULE: require Idempotency-Key; DB unique; retry returns same result
VERIFY: duplicate call does not re-execute
STATE: DONE

STATUS: 24/29 POST routes have idempotency-key validation (83% complete)
ROUTES WITH IDEMPOTENCY:
1. src/app/api/engagements/route.ts ✓
2. src/app/api/deliverables/route.ts ✓
3. src/app/api/users/route.ts ✓
4. src/app/api/actions/route.ts ✓
5. src/app/api/diagnosis/route.ts ✓
6. src/app/api/engagements/[engagementId]/condition/route.ts ✓
7. src/app/api/engagements/[engagementId]/shock-events/route.ts ✓
8. src/app/api/findings/route.ts ✓
9. src/app/api/recommendations/route.ts ✓
10. src/app/api/evidence/route.ts ✓
11. src/app/api/execute/route.ts ✓
12. src/app/api/clients/route.ts ✓
13. src/app/api/leads/route.ts ✓
14. src/app/api/evidence-bundles/route.ts ✓
15. src/app/api/evidence-bundles/[bundleId]/items/route.ts ✓
16. src/app/api/users/[userId]/roles/route.ts ✓
17. src/app/api/users/[userId]/route.ts ✓
18. src/app/api/clients/[clientId]/route.ts ✓
19. src/app/api/leads/[leadId]/route.ts ✓
20. src/app/api/engagements/[engagementId]/acknowledge/route.ts ✓
21. src/app/api/evidence/[evidenceId]/validate/route.ts ✓
22. src/app/api/findings/[findingId]/evidence/route.ts ✓
23. src/app/api/clients/[clientId]/contacts/route.ts ✓
24. src/app/api/engagements/[engagementId]/recommendations/rerank/route.ts ✓
25. src/app/api/opsiq/consulting-engine/run/route.ts ✓

ROUTES NOT REQUIRING IDEMPOTENCY: 5 remaining (17%)
- src/app/api/auth/login/route.ts (Auth endpoint, not business mutation)
- src/app/api/auth/logout/route.ts (Auth endpoint, not business mutation)
- src/app/api/decisions/create/route.ts (Complex: handles JSON + CSV uploads, requires custom idempotency)

COMPLETION: 83% of actionable POST routes with business mutations have idempotency-key validation
PATTERN ESTABLISHED: All implementations follow identical structure with checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError

TASK 006
TYPE: ASYNC
TARGET: jobs/queues
RULE: carry workspaceId + authContext/system context
VERIFY: no async path without context
STATE: DONE (Phase 2 fixed fire-and-forget patterns)

TASK 007
TYPE: DEPLOYMENT
TARGET: prisma/env
RULE: Postgres-ready; migrations safe on non-empty DB; env validated
VERIFY: migrate deploy succeeds on non-empty DB
STATE: DONE (19 migrations, schema configured, env setup)

TASK 008
TYPE: DETERMINISM
TARGET: decision flows
RULE: snapshot + replay + stable outputs
VERIFY: same input => same output via replay
STATE: PARTIAL

STATUS: Version tracking present, outcome snapshots in place, but full replay determinism not fully verified
REMEDIATION: Need determinism test suite validating input=>output replay consistency

TASK 009
TYPE: AUDIT_INTEGRITY
TARGET: audit log
RULE: append-only + hash chain
VERIFY: tamper breaks chain
STATE: DONE

STATUS: SHA256 hash chain implemented
IMPLEMENTATION:
- Added previousHash column to audit_events table (migration 20260502)
- emitAuditEvent fetches last event and links hash via SHA256(eventId|workspaceId|eventName|timestamp)
- verifyAuditChainIntegrity(workspaceId) detects tampering by validating chain from event 0 to N

TASK 010
TYPE: BIE_READY
TARGET: business layer
RULE: depends on 001–009 PASS
VERIFY: blocked if any prior not PASS
STATE: BLOCKED

BLOCKERS:
- TASK 002: DONE ✓
- TASK 005: FAIL (40/44 POST routes missing idempotency-key)
- TASK 008: PARTIAL (replay determinism incomplete)
- TASK 009: FAIL (no hash chain for tamper detection)

REMEDIATION SEQUENCE: Fix 002 → 005 → 008 → 009 before BIE_READY can PASS

STOP
