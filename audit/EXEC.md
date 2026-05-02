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
STATE: FAIL

VIOLATIONS FOUND:
- decision-evidence.service.ts: engagement.findUnique, action.findMany, finding.findMany, recommendation.findMany (missing workspaceId)
- operator/store.ts: operatorItem.findUnique (missing workspaceId)
- outcome/outcome.service.ts: engagement.findUnique (missing workspaceId)

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
STATE: FAIL

STATUS: Only 4/44 POST routes have idempotency-key validation
REMEDIATION: Add checkIdempotencyKey to remaining 40 routes

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
STATE: FAIL

STATUS: No hash chain or cryptographic integrity mechanism present
REMEDIATION: Add previousHash field to AuditEvent, compute SHA256 chain on insertion

TASK 010
TYPE: BIE_READY
TARGET: business layer
RULE: depends on 001–009 PASS
VERIFY: blocked if any prior not PASS
STATE: BLOCKED

BLOCKERS:
- TASK 002: FAIL (unscoped Prisma reads in decision-evidence, operator/store, outcome)
- TASK 005: FAIL (40/44 POST routes missing idempotency-key)
- TASK 008: PARTIAL (replay determinism incomplete)
- TASK 009: FAIL (no hash chain for tamper detection)

REMEDIATION SEQUENCE: Fix 002 → 005 → 008 → 009 before BIE_READY can PASS

STOP
