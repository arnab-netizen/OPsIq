# A7.6 Root-Cause Tree

## DC-A7.6-I1: Workspace Isolation Bypass

```
SYMPTOM
  Routes using withCanonicalEnforcement still obtain workspaceId from
  unverified sources (request header, broken context.ts, request body).

IMMEDIATE CODING MISTAKE
  I1A: `ctx.request!.headers.get("x-workspace-id") || ""` instead of `ctx.verifiedWorkspaceId`
  I1B: `requireWorkspaceContext()` from context.ts instead of `ctx.verifiedWorkspaceId`
  I1C: `body.rejectedBy` / `body.approvedBy` / etc. instead of `ctx.verifiedActorId`

ARCHITECTURAL WEAKNESS
  `withCanonicalEnforcement` provides `ctx.verifiedWorkspaceId` and `ctx.verifiedActorId`
  but the framework does not enforce that routes USE them. Routes can silently fall back
  to unverified alternatives with no compile-time or lint warning.

MISSING INVARIANT
  No rule enforces that routes wrapping `withCanonicalEnforcement` must obtain
  workspaceId exclusively from `ctx.verifiedWorkspaceId` and actorId from
  `ctx.verifiedActorId`. No ESLint rule, no TypeScript type constraint, no code review
  checklist item currently enforces this.

PERMANENT PREVENTION MECHANISM
  1. ESLint rule: within files that import `withCanonicalEnforcement`, flag any
     access to `request.headers.get("x-workspace-id")` or import of
     `requireWorkspaceContext` from `context.ts`.
  2. TypeScript: make `CanonicalAuthContext` the only public interface; make raw
     `Request` access on the context require going through typed helpers.
  3. Code review gate in PR template: "If this route uses withCanonicalEnforcement,
     does it exclusively read workspaceId from ctx.verifiedWorkspaceId?"
```

---

## DC-A7.6-I20: Broken Workspace Resolution as Root Cause for I1B

```
SYMPTOM
  7 callers (5 routes + operator/store.ts + audit-log.ts) call requireWorkspaceContext()
  and get session.user.id as the workspace ID.

IMMEDIATE CODING MISTAKE
  src/services/workspace/context.ts line: `const workspaceId = session.user.id;`
  Comment in file: `// temporary: use user ID as workspace`

ARCHITECTURAL WEAKNESS
  The temporary placeholder was never removed. A correct implementation
  (activation-context.ts) exists and does a real DB lookup via
  `db.workspaceMembership.findFirst`, but no production route imports from it.
  Three files export a function named `requireWorkspaceContext` with three different
  contracts — no module boundary or naming convention distinguishes them.

MISSING INVARIANT
  No rule prevents multiple files from exporting identically-named functions with
  incompatible contracts. No deprecation marker on context.ts prevents new callers.

PERMANENT PREVENTION MECHANISM
  1. Delete context.ts::getWorkspaceContext / requireWorkspaceContext after all callers
     migrate to either ctx.verifiedWorkspaceId (canonical routes) or activation-context.ts
     (non-canonical routes that need DB-backed resolution).
  2. Rename activation-context.ts function to `resolveWorkspaceMembership` to avoid
     name collision with the now-deleted broken version.
  3. Add `@deprecated` JSDoc to context.ts immediately to prevent new imports.
```

---

## DC-A7.6-I12: Duplicate Auth Patterns

```
SYMPTOM
  274 routes use withCanonicalEnforcement, 39 use enforceWorkspaceScoping, 40+ use
  withAuth/withEnforcementFull/none. Workspace isolation guarantees vary per pattern.

IMMEDIATE CODING MISTAKE
  New routes were written against enforceWorkspaceScoping or withAuth without migrating
  the old wrapper to withCanonicalEnforcement.

ARCHITECTURAL WEAKNESS
  All three auth wrappers are importable. No deprecation, no lint rule, no build constraint
  prevents selecting the non-canonical wrapper.

MISSING INVARIANT
  "New routes MUST use withCanonicalEnforcement" is not codified anywhere.

PERMANENT PREVENTION MECHANISM
  1. Mark enforceWorkspaceScoping and withAuth as @deprecated.
  2. ESLint no-restricted-imports rule for new files importing enforceWorkspaceScoping.
  3. PR template checklist item: "Which auth wrapper does this route use? If not
     withCanonicalEnforcement, document why."
```

---

## DC-A7.6-I13: Duplicate State Machines

```
SYMPTOM
  9 independent state machine implementations encode transition rules for 5+ entity types.
  A valid new transition added to one will be absent from others, causing silent divergence.

IMMEDIATE CODING MISTAKE
  Each service/domain file defined its own local transition map rather than importing
  from a central registry.

ARCHITECTURAL WEAKNESS
  No canonical state machine registry exists. No rule says "thou shalt not define a
  local ALLOWED_TRANSITIONS or canTransitionTo".

MISSING INVARIANT
  A single source of truth for all entity state transitions does not exist.

PERMANENT PREVENTION MECHANISM
  1. Create src/domain/state-machine-registry.ts with all transition maps.
  2. ESLint rule: flag local variable names matching /ALLOWED_TRANSITIONS|canTransitionTo|validTransitions/
     outside of state-machine-registry.ts.
```

---

## DC-A7.6-I16: Duplicate Audit Logic

```
SYMPTOM
  Two audit writers (emitAuditEvent and logAuditEvent) with different contracts.
  20+ services write directly to db.auditEvent.create, bypassing hash chaining.

IMMEDIATE CODING MISTAKE
  Services imported logAuditEvent from audit-log.ts (which has no hash chain) or
  called Prisma directly instead of emitAuditEvent from infra/audit.ts.

ARCHITECTURAL WEAKNESS
  Both audit writers are equally importable. Prisma client is directly accessible
  to services, enabling bypass. No ESLint rule or module boundary prevents direct
  db.auditEvent.create calls.

MISSING INVARIANT
  "All audit writes MUST go through emitAuditEvent" is not enforced by any tooling.

PERMANENT PREVENTION MECHANISM
  1. Delete logAuditEvent (or make it a thin wrapper that calls emitAuditEvent).
  2. ESLint no-restricted-syntax: flag direct `auditEvent.create` / `auditEvent.upsert`
     calls anywhere outside of infra/audit.ts.
  3. Mark audit-log.ts as @deprecated.
```
