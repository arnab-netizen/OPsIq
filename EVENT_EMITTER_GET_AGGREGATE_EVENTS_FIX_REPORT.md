# EventEmitterService.getAggregateEvents Fix Report

Date: 2026-06-11
Branch: `claude/vibrant-ramanujan-mdqej8`
PR: #31 (head was `68a7180` before this change)

## 1. Root cause

The Phase 3 Slice 2 integration test
(`src/__tests__/phase-3-event-emitter-integration.test.ts`) calls
`EventEmitterService.getAggregateEvents(aggregateId, aggregateType, workspaceId)`
**7 times** (to read back persisted events and to assert tenant isolation), but
`EventEmitterService` (`src/services/event-emitter.ts`) implemented only `emit()`.
The read method did not exist, so the test failed at runtime with:

```
TypeError: EventEmitterService.getAggregateEvents is not a function
  ❯ phase-3-event-emitter-integration.test.ts:386 and :428
```

The `CanonicalEvent` model and its `@@index([aggregateId, aggregateType, workspaceId])`
plus the `event_number` ordering already existed — only the service read method was
missing.

## 2. Why the bug was hidden before

This integration test never executed in CI:
1. **Gate 2** (`prisma migrate deploy`) failed first with `P1001` because the
   committed `.env.local` placeholder overrode the CI `DATABASE_URL`
   (fixed in `f4f4794`).
2. Even after that, **Gate 6** ran the test without `TEST_WITH_DB=true`, so Vitest
   excluded `**/phase-*.test.ts` and reported "No test files found"
   (fixed in `68a7180`).
Only once both were fixed did Gate 6 actually run the test and surface the missing
method. So the gap was masked by two upstream CI failures.

## 3. Files changed

- `src/services/event-emitter.ts` — added the static read method
  `getAggregateEvents`. No change to `emit()` or any other behavior.
- `EVENT_EMITTER_GET_AGGREGATE_EVENTS_FIX_REPORT.md` — this report.

No test file changed (existing coverage is sufficient — see §6). No workflow,
schema, `.env*`, or migration change.

## 4. Exact implementation

```ts
static async getAggregateEvents(
  aggregateId: string,
  aggregateType: string,
  workspaceId: string
): Promise<EmittedEvent[]> {
  interface CanonicalEventRow { /* id, aggregateId, ..., payload: unknown, ... */ }

  const events = (await db.canonicalEvent.findMany({
    where: { aggregateId, aggregateType, workspaceId },
    orderBy: { eventNumber: "asc" },
  })) as CanonicalEventRow[];

  return events.map((event): EmittedEvent => {
    const rawPayload = event.payload as unknown;
    const payload: EventPayload = isEventPayload(rawPayload) ? rawPayload : {};
    return {
      id: event.id, aggregateId: event.aggregateId, aggregateType: event.aggregateType,
      eventType: event.eventType, eventVersion: event.eventVersion,
      eventNumber: event.eventNumber, payload,
      actorId: event.actorId, workspaceId: event.workspaceId,
      causationId: event.causationId, correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey || undefined,
      visibilityScope: event.visibilityScope,
      sensitivityClassification: event.sensitivityClassification,
      occurredAt: event.occurredAt, recordedAt: event.recordedAt,
    };
  });
}
```

- Returns the **same `EmittedEvent` shape** that `emit()` returns (identical field
  mapping, reusing the existing `isEventPayload` guard for the JSON payload).
- A small local `CanonicalEventRow` interface types the rows (the `db` proxy is
  untyped); **no `any`** is used (satisfies `noImplicitAny` and the lint ratchet).

## 5. Why it is read-only and tenant-safe

- **Read-only:** the only DB call is `db.canonicalEvent.findMany`. No create/update/
  delete, no raw SQL, no mutation of any kind.
- **Tenant-safe:** the `where` filters by exactly `aggregateId` + `aggregateType` +
  `workspaceId`, so events from other workspaces are never returned (the test's
  cross-workspace isolation assertion relies on this).
- **Deterministic:** ordered by `eventNumber: "asc"` (event sequence order).
- No secrets or payloads are logged.

## 6. Tests

No new test was added — the existing `phase-3-event-emitter-integration.test.ts`
already exercises `getAggregateEvents` for persistence (`events.length`,
`events[0].id`), ordering, and cross-workspace tenant isolation. Adding more would
be redundant. The existing test was not weakened, skipped, renamed, or deleted.

## 7. Commands run and results

| Command | Result |
|---|---|
| `git diff --check` | clean (exit 0) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 errors — no increase) |
| `npx prisma validate` | valid 🚀 |
| `npm run build` | Compiled successfully (type-checks the new method) |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` | 5472 passed; 1 unrelated **timing flake** (`phase-c/canonical-telemetry-lifecycle.test.ts:406`, a `setTimeout(10)` duration assertion) that **passes 18/18 in isolation** and has zero references to event-emitter |

The Phase 3 DB integration test requires a database with migrations applied; it was
**not** run locally (no local DB, and running the migration chain locally is out of
scope per the hard rules). **CI Gate 6 proves that test** after push.

## 8. No secrets printed or committed

Confirmed — no URLs/credentials in the change; staged-diff secret scan performed.

## 9. No `.env*` files modified

Confirmed.

## 10. No migration run manually

Confirmed — no `prisma migrate deploy`/`reset`/`db push` run locally or against any
real database.

## 11. Owner Recovery Module 1 unaffected

Confirmed — no Module 1 code/schema/migration/routes/tests changed; founder-recovery
suite green; build green.

## 12. Module 2 remains blocked / public/SaaS remains frozen

Confirmed — no Module 2 work; no public/SaaS/billing/marketing files touched.
