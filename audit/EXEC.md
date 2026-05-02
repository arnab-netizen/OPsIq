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
STATE: OPEN

TASK 002
TYPE: READ
TARGET: repo-wide
RULE: all prisma reads scoped by workspaceId; no overfetch/filter
VERIFY: no prisma read without workspaceId
STATE: OPEN

TASK 003
TYPE: CAPABILITY
TARGET: services/**
RULE: enforce capability on read+write (not role-only)
VERIFY: each service has capability check
STATE: OPEN

TASK 004
TYPE: AUDIT
TARGET: services/**
RULE: every mutation emits emitAuditEvent with workspaceId + actorId(authContext)
VERIFY: all create/update/delete have audit call
STATE: OPEN

TASK 005
TYPE: IDEMPOTENCY
TARGET: POST routes
RULE: require Idempotency-Key; DB unique; retry returns same result
VERIFY: duplicate call does not re-execute
STATE: OPEN

TASK 006
TYPE: ASYNC
TARGET: jobs/queues
RULE: carry workspaceId + authContext/system context
VERIFY: no async path without context
STATE: OPEN

TASK 007
TYPE: DEPLOYMENT
TARGET: prisma/env
RULE: Postgres-ready; migrations safe on non-empty DB; env validated
VERIFY: migrate deploy succeeds on non-empty DB
STATE: OPEN

TASK 008
TYPE: DETERMINISM
TARGET: decision flows
RULE: snapshot + replay + stable outputs
VERIFY: same input => same output via replay
STATE: OPEN

TASK 009
TYPE: AUDIT_INTEGRITY
TARGET: audit log
RULE: append-only + hash chain
VERIFY: tamper breaks chain
STATE: OPEN

TASK 010
TYPE: BIE_READY
TARGET: business layer
RULE: depends on 001–009 PASS
VERIFY: blocked if any prior not PASS
STATE: OPEN

STOP
