/**
 * PHASE RP1: Real PostgreSQL Runtime Proof Tests
 *
 * Empirically verify Phase 3 persistence behavior under live database.
 * Runs in the DB lane only: vitest.config.ts excludes runtime-proof/** unless
 * TEST_WITH_DB=true (main-integration.yml full suite).
 *
 * These tests MUST run with DATABASE_URL configured and pointing to real PostgreSQL.
 * They are NOT mocked. They are NOT stubbed. They verify real persistence.
 *
 * Fixtures follow the CanonicalEvent contract in prisma/schema.prisma
 * (migrations 20260507_add_canonical_event + 20260511_add_aggregate_locks):
 * aggregateType / eventType / payload / actorId (uuid) / workspaceId (uuid) /
 * causationId / correlationId / occurredAt. The original fixtures used
 * eventName / eventData / timestamp / actor -- fields that never existed on the
 * model -- so every create failed Prisma validation before reaching the DB.
 *
 * canonical_events is append-only at the DB level (BEFORE UPDATE / BEFORE
 * DELETE triggers), so rows written here cannot be cleaned up; every test uses
 * fresh random workspace ids so runs never collide.
 */

import { describe, it, expect } from "vitest";
import { createHash, randomUUID } from "crypto";
import { db } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";
import { SnapshotOptimizationEngine } from "@/services/snapshot-optimization-engine";
import { ProjectionRebuildEngine } from "@/services/projection-rebuild-engine";

const RUN_ACTOR = randomUUID();
const AGGREGATE_TYPE = "recommendation";

function eventData(fields: {
  workspaceId: string;
  aggregateId: string;
  eventNumber: number;
  eventType: string;
  payload: Record<string, string | number>;
  idempotencyKey?: string;
}) {
  return {
    aggregateType: AGGREGATE_TYPE,
    actorId: RUN_ACTOR,
    causationId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date(),
    ...fields,
  };
}

/**
 * Snapshot tests need a real Workspace row (SnapshotData.workspaceId is a FK).
 * Returns a cleanup that removes the removable rows (snapshots, projections,
 * engagement, client, workspace); canonical_events stay (append-only).
 */
async function createSnapshotWorkspace() {
  const workspaceId = randomUUID();
  await db.workspace.create({
    data: { id: workspaceId, name: "RP1 snapshot proof", slug: `rp1-snap-${workspaceId}`, createdBy: RUN_ACTOR },
  });
  const clientIds: string[] = [];
  return {
    workspaceId,
    async createEngagement() {
      const clientId = randomUUID();
      const engagementId = randomUUID();
      clientIds.push(clientId);
      await db.clientAccount.create({ data: { id: clientId, name: "RP1 client", createdBy: RUN_ACTOR, updatedAt: new Date() } });
      await db.engagement.create({
        data: {
          id: engagementId,
          workspaceId,
          clientId,
          createdBy: RUN_ACTOR,
          title: "RP1 engagement",
          code: `RP1-${engagementId}`,
          serviceTier: "standard",
          engagementMode: "advisory",
          updatedAt: new Date(),
        },
      });
      return engagementId;
    },
    async cleanup() {
      await db.snapshotData.deleteMany({ where: { workspaceId } });
      await db.recommendation.deleteMany({ where: { workspaceId } });
      await db.engagement.deleteMany({ where: { workspaceId } });
      await db.clientAccount.deleteMany({ where: { id: { in: clientIds } } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    },
  };
}

/** Append generic events from..to; each sets k<n>=v<n> and last=n (generic Object.assign fold). */
async function appendLedger(workspaceId: string, aggregateId: string, from: number, to: number) {
  for (let n = from; n <= to; n++) {
    await db.canonicalEvent.create({
      data: eventData({ workspaceId, aggregateId, eventNumber: n, eventType: "ledger.entry_recorded", payload: { [`k${n}`]: `v${n}`, last: n } }),
    });
  }
}

/** Independent oracle for the derived state after ledger events 1..n. */
function ledgerState(aggregateId: string, n: number): Record<string, unknown> {
  const state: Record<string, unknown> = { aggregateId, aggregateType: AGGREGATE_TYPE };
  for (let i = 1; i <= n; i++) {
    state[`k${i}`] = `v${i}`;
    state.last = i;
  }
  return state;
}

type Replayed = Awaited<ReturnType<typeof EventReplayEngine.replayAggregate>>;

function withoutHistory(state: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...state };
  delete rest.events;
  return rest;
}

function appliedEventNumbers(r: Replayed): number[] {
  return ((r.state.events as Array<{ eventNumber: number }>) ?? []).map((e) => e.eventNumber);
}

async function expectUniqueViolation(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ code: "P2002" });
}

describe("PHASE RP1: Real PostgreSQL Runtime Persistence Proof", () => {
  describe("A. Append-Only Guarantee", () => {
    it("event cannot be mutated after append", async () => {
      const workspaceId = randomUUID();
      // Create event
      const event = await db.canonicalEvent.create({
        data: eventData({
          workspaceId,
          aggregateId: "test-agg-1",
          eventNumber: 1,
          eventType: "TEST_EVENT_IMMUTABLE",
          payload: { originalValue: "immutable" },
        }),
      });

      // UPDATE is rejected by the canonical_events_prevent_update trigger
      await expect(
        db.canonicalEvent.update({
          where: { id: event.id },
          data: { payload: { originalValue: "tampered" } },
        })
      ).rejects.toThrow(/append-only/);

      // DELETE is rejected by the canonical_events_prevent_delete trigger
      await expect(
        db.canonicalEvent.delete({ where: { id: event.id } })
      ).rejects.toThrow(/append-only/);

      // Bulk paths are blocked by the same row triggers
      await expect(
        db.canonicalEvent.updateMany({
          where: { id: event.id },
          data: { eventType: "TAMPERED" },
        })
      ).rejects.toThrow(/append-only/);

      const updateAttempt = await db.canonicalEvent.findUnique({
        where: { id: event.id },
      });

      expect(updateAttempt?.payload).toEqual({ originalValue: "immutable" });
      expect(updateAttempt?.eventType).toBe("TEST_EVENT_IMMUTABLE");
    });

    it("eventNumber is monotonically increasing per aggregate", async () => {
      const workspaceId = randomUUID();
      const aggId = "test-agg-monotonic-" + Date.now();

      // Append 3 events
      const event1 = await db.canonicalEvent.create({
        data: eventData({ workspaceId, aggregateId: aggId, eventNumber: 1, eventType: "E1", payload: {} }),
      });

      const event2 = await db.canonicalEvent.create({
        data: eventData({ workspaceId, aggregateId: aggId, eventNumber: 2, eventType: "E2", payload: {} }),
      });

      const event3 = await db.canonicalEvent.create({
        data: eventData({ workspaceId, aggregateId: aggId, eventNumber: 3, eventType: "E3", payload: {} }),
      });

      // Verify monotonicity
      expect(event1.eventNumber).toBe(1);
      expect(event2.eventNumber).toBe(2);
      expect(event3.eventNumber).toBe(3);
      expect(event2.eventNumber).toBeGreaterThan(event1.eventNumber);
      expect(event3.eventNumber).toBeGreaterThan(event2.eventNumber);

      // A reused eventNumber on the same aggregate is rejected by
      // unique_event_number_per_aggregate (no forked history).
      await expectUniqueViolation(
        db.canonicalEvent.create({
          data: eventData({ workspaceId, aggregateId: aggId, eventNumber: 2, eventType: "E2_FORK", payload: {} }),
        })
      );
      expect(await db.canonicalEvent.count({ where: { workspaceId, aggregateId: aggId } })).toBe(3);
    });
  });

  describe("B. Duplicate Replay Idempotency", () => {
    it("replaying same event twice produces identical state", async () => {
      const workspaceId = randomUUID();
      const aggId = "test-agg-replay-idempotent-" + Date.now();

      // Create initial state
      await db.canonicalEvent.create({
        data: eventData({
          workspaceId,
          aggregateId: aggId,
          eventNumber: 1,
          eventType: "STATE_INITIALIZED",
          payload: { state: "initial" },
        }),
      });

      // Fetch first time
      const fetch1 = await db.canonicalEvent.findMany({
        where: { workspaceId, aggregateId: aggId },
        orderBy: { eventNumber: "asc" },
      });

      // Fetch second time (identical query)
      const fetch2 = await db.canonicalEvent.findMany({
        where: { workspaceId, aggregateId: aggId },
        orderBy: { eventNumber: "asc" },
      });

      // Verify identical
      expect(fetch1.length).toBe(1);
      expect(fetch1.length).toBe(fetch2.length);
      expect(JSON.stringify(fetch1)).toBe(JSON.stringify(fetch2));
    });

    it("posting duplicate event with idempotencyKey is safe", async () => {
      const workspaceId = randomUUID();
      const aggId = "test-agg-idempotency-key-" + Date.now();
      const idempotencyKey = "ik-duplicate-" + randomUUID();

      // First post
      await db.canonicalEvent.create({
        data: eventData({
          workspaceId,
          aggregateId: aggId,
          eventNumber: 1,
          eventType: "DUPLICATE_TEST",
          payload: { idempotencyKey },
          idempotencyKey,
        }),
      });

      // A second write with the same key in the same workspace is rejected by
      // the (idempotency_key, workspace_id) unique index -- even with a fresh
      // eventNumber, so a retried request cannot append a second copy.
      await expectUniqueViolation(
        db.canonicalEvent.create({
          data: eventData({
            workspaceId,
            aggregateId: aggId,
            eventNumber: 2,
            eventType: "DUPLICATE_TEST",
            payload: { idempotencyKey },
            idempotencyKey,
          }),
        })
      );

      // Check how many events with this idempotency key exist
      const checkCount = await db.canonicalEvent.count({
        where: { workspaceId, idempotencyKey },
      });
      expect(checkCount).toBe(1);

      // Service layer: EventEmitterService.emit with a repeated key returns the
      // original event instead of appending.
      const svcWorkspace = randomUUID();
      const svcAgg = "test-agg-idempotency-svc-" + Date.now();
      const svcKey = "ik-svc-" + randomUUID();
      const request = {
        aggregateId: svcAgg,
        aggregateType: AGGREGATE_TYPE,
        eventType: "DUPLICATE_TEST",
        eventVersion: 1,
        payload: { k: "v" },
        actorId: RUN_ACTOR,
        workspaceId: svcWorkspace,
        idempotencyKey: svcKey,
      };
      const first = await EventEmitterService.emit(request);
      const second = await EventEmitterService.emit(request);
      expect(second.id).toBe(first.id);
      expect(await db.canonicalEvent.count({ where: { workspaceId: svcWorkspace, aggregateId: svcAgg } })).toBe(1);
    });
  });

  describe("C. Concurrent Event Append Ordering", () => {
    it("concurrent appends maintain order under database isolation", async () => {
      const workspaceId = randomUUID();
      const aggId = "test-agg-concurrent-" + Date.now();

      await Promise.all(
        [1, 2, 3].map((n) =>
          db.canonicalEvent.create({
            data: eventData({ workspaceId, aggregateId: aggId, eventNumber: n, eventType: `CONCURRENT_E${n}`, payload: {} }),
          })
        )
      );

      // Fetch all and verify order
      const stored = await db.canonicalEvent.findMany({
        where: { workspaceId, aggregateId: aggId },
        orderBy: { eventNumber: "asc" },
      });

      expect(stored.length).toBe(3);
      for (let i = 0; i < stored.length - 1; i++) {
        expect(stored[i].eventNumber).toBeLessThan(stored[i + 1].eventNumber);
      }

      // Real append path: concurrent EventEmitterService.emit calls on one
      // aggregate are serialized by the aggregate lock -> exactly 1..N, no gaps,
      // no duplicates.
      const svcWorkspace = randomUUID();
      const svcAgg = "test-agg-concurrent-svc-" + Date.now();
      const N = 10;
      const emitted = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          EventEmitterService.emit({
            aggregateId: svcAgg,
            aggregateType: AGGREGATE_TYPE,
            eventType: `CONCURRENT_SVC_${i}`,
            eventVersion: 1,
            payload: { i: String(i) },
            actorId: RUN_ACTOR,
            workspaceId: svcWorkspace,
          })
        )
      );
      expect(emitted.map((e) => e.eventNumber).sort((a, b) => a - b)).toEqual(
        Array.from({ length: N }, (_, i) => i + 1)
      );
    });
  });

  describe("D. Snapshot Parity After Replay", () => {
    it("snapshot matches final state after event replay", async () => {
      const ws = await createSnapshotWorkspace();
      try {
        const aggId = "test-agg-snapshot-parity-" + randomUUID();
        await appendLedger(ws.workspaceId, aggId, 1, 5);

        // Build aggregate from events (full replay, no snapshot yet)
        const replayed = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(replayed.usedSnapshot).toBe(false);
        expect(appliedEventNumbers(replayed)).toEqual([1, 2, 3, 4, 5]);
        expect(withoutHistory(replayed.state)).toEqual(ledgerState(aggId, 5));

        // Replay persisted a snapshot at the last applied event whose state is the
        // replayed derived state (history excluded by design) and whose checksum verifies.
        const row = await db.snapshotData.findUniqueOrThrow({
          where: { aggregateId_aggregateType_workspaceId: { aggregateId: aggId, aggregateType: AGGREGATE_TYPE, workspaceId: ws.workspaceId } },
        });
        expect(row.eventNumber).toBe(5);
        expect(row.state).toEqual(withoutHistory(replayed.state));
        const valid = await SnapshotOptimizationEngine.getValidSnapshot(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(valid?.lastEventNumber).toBe(5);
        expect(valid?.checksum).toBe(row.checksum);

        // Restoring from the snapshot yields the same aggregate as the full replay.
        const restored = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(restored.usedSnapshot).toBe(true);
        expect(appliedEventNumbers(restored)).toEqual([]);
        expect(restored.version).toBe(replayed.version);
        expect(restored.lastEventNumber).toBe(replayed.lastEventNumber);
        expect(withoutHistory(restored.state)).toEqual(withoutHistory(replayed.state));
      } finally {
        await ws.cleanup();
      }
    });
  });

  describe("E. Projection Rebuild Parity", () => {
    it("rebuilt projection matches materialized view", async () => {
      const ws = await createSnapshotWorkspace();
      try {
        const engagementId = await ws.createEngagement();
        const recId = randomUUID();

        // 1. Recommendation with events: created, then priority and title changes
        const evt = (eventNumber: number, eventType: string, payload: Record<string, string | number>) =>
          db.canonicalEvent.create({
            data: eventData({ workspaceId: ws.workspaceId, aggregateId: recId, eventNumber, eventType, payload }),
          });
        await evt(1, "recommendation.created", {
          engagementId,
          title: "Initial title",
          description: "Initial description",
          priority: "high",
          evidenceValidationScore: "0.85",
          reliabilityLevel: "high",
          kpiHealthScore: "0.72",
          kpiRiskLevel: "medium",
        });
        await evt(2, "recommendation.priority_updated", { priority: "critical" });
        await evt(3, "recommendation.updated", { title: "Final title" });

        // Materialized projection as the write path left it after those events
        await db.recommendation.create({
          data: {
            id: recId,
            workspaceId: ws.workspaceId,
            engagementId,
            title: "Final title",
            description: "Initial description",
            priority: "critical",
            evidenceValidationScore: 85,
            reliabilityLevel: "high",
            kpiHealthScore: 72,
            kpiRiskLevel: "medium",
            createdBy: RUN_ACTOR,
          },
        });
        const projectionFields = {
          id: true, workspaceId: true, engagementId: true, title: true, description: true, priority: true,
          evidenceValidationScore: true, reliabilityLevel: true, kpiHealthScore: true, kpiRiskLevel: true,
        } as const;
        const materialized = await db.recommendation.findUniqueOrThrow({ where: { id: recId }, select: projectionFields });

        // 2. Build projection from events only
        const result = await ProjectionRebuildEngine.rebuildRecommendationProjection(recId, ws.workspaceId);
        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
        expect(result.parityCheckPassed).toBe(true);
        expect(result.eventsProcessed).toBe(3);

        // 3. Rebuilt record equals the materialized record field-for-field
        const rebuilt = await db.recommendation.findUniqueOrThrow({ where: { id: recId }, select: projectionFields });
        expect(rebuilt).toEqual(materialized);
      } finally {
        await ws.cleanup();
      }
    });
  });

  describe("F. Transaction Rollback Safety", () => {
    it("rolled back transaction does not persist partial state", async () => {
      const workspaceId = randomUUID();
      const aggId = "test-agg-rollback-" + Date.now();

      await expect(
        db.$transaction(async (tx) => {
          await tx.canonicalEvent.create({
            data: eventData({ workspaceId, aggregateId: aggId, eventNumber: 1, eventType: "ROLLBACK_E1", payload: {} }),
          });
          await tx.canonicalEvent.create({
            data: eventData({ workspaceId, aggregateId: aggId, eventNumber: 2, eventType: "ROLLBACK_E2", payload: {} }),
          });
          throw new Error("RP1_FORCED_ROLLBACK");
        })
      ).rejects.toThrow("RP1_FORCED_ROLLBACK");

      expect(await db.canonicalEvent.count({ where: { workspaceId, aggregateId: aggId } })).toBe(0);
    });
  });

  describe("G. Stale Snapshot Invalidation", () => {
    it("snapshot older than latest event is detected and ignored", async () => {
      // Contract (event-replay-engine.ts + snapshot-optimization-engine.ts): a snapshot
      // behind the head is never served as current state -- replay resumes at the
      // event after it; a snapshot past the 24h freshness window is discarded and
      // replay starts from event 1.
      const ws = await createSnapshotWorkspace();
      try {
        const aggId = "test-agg-stale-snapshot-" + randomUUID();

        // 1. Create snapshot at eventNumber 5
        await appendLedger(ws.workspaceId, aggId, 1, 5);
        await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        const snap5 = await SnapshotOptimizationEngine.getValidSnapshot(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(snap5?.lastEventNumber).toBe(5);

        // 2. Append new events (6, 7, 8)
        await appendLedger(ws.workspaceId, aggId, 6, 8);

        // 3. Replay starts from event 6, not the snapshot state
        const replayed = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(replayed.usedSnapshot).toBe(true);
        expect(appliedEventNumbers(replayed)).toEqual([6, 7, 8]);
        expect(replayed.lastEventNumber).toBe(8);
        expect(replayed.version).toBe(8);
        expect(withoutHistory(replayed.state)).toEqual(ledgerState(aggId, 8));
        expect(withoutHistory(replayed.state)).not.toEqual(snap5?.state);
        expect((await SnapshotOptimizationEngine.getValidSnapshot(aggId, AGGREGATE_TYPE, ws.workspaceId))?.lastEventNumber).toBe(8);

        // Age-stale snapshot (outside the 24h window) is ignored and removed: full replay.
        await db.snapshotData.updateMany({
          where: { aggregateId: aggId, aggregateType: AGGREGATE_TYPE, workspaceId: ws.workspaceId },
          data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        });
        expect(await SnapshotOptimizationEngine.getValidSnapshot(aggId, AGGREGATE_TYPE, ws.workspaceId)).toBeNull();
        expect(await db.snapshotData.count({ where: { aggregateId: aggId, workspaceId: ws.workspaceId } })).toBe(0);
        const full = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(full.usedSnapshot).toBe(false);
        expect(appliedEventNumbers(full)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(withoutHistory(full.state)).toEqual(ledgerState(aggId, 8));
      } finally {
        await ws.cleanup();
      }
    });
  });

  describe("H. Corrupted Snapshot Rejection", () => {
    it("snapshot with corrupted state is rejected and full replay triggered", async () => {
      const ws = await createSnapshotWorkspace();
      try {
        const aggId = "test-agg-corrupt-snapshot-" + randomUUID();
        await appendLedger(ws.workspaceId, aggId, 1, 4);
        await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        const original = await db.snapshotData.findFirstOrThrow({ where: { aggregateId: aggId, workspaceId: ws.workspaceId } });
        expect(original.eventNumber).toBe(4);

        // 1. Corrupt the persisted state while keeping the stored checksum
        await db.snapshotData.update({
          where: { id: original.id },
          data: { state: { ...ledgerState(aggId, 4), k2: "TAMPERED", injected: "x" } },
        });

        // 2. Attempt to load snapshot: checksum mismatch -> rejected and removed
        expect(await SnapshotOptimizationEngine.getValidSnapshot(aggId, AGGREGATE_TYPE, ws.workspaceId)).toBeNull();
        expect(await db.snapshotData.count({ where: { id: original.id } })).toBe(0);

        // Corrupt again and go through the replay path directly
        await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        const fresh = await db.snapshotData.findFirstOrThrow({ where: { aggregateId: aggId, workspaceId: ws.workspaceId } });
        await db.snapshotData.update({ where: { id: fresh.id }, data: { state: { ...ledgerState(aggId, 4), k2: "TAMPERED" } } });

        // 3. Replay falls back to full replay: events 1..4 applied, no tampered value
        const replayed = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(replayed.usedSnapshot).toBe(false);
        expect(appliedEventNumbers(replayed)).toEqual([1, 2, 3, 4]);
        expect(replayed.state.k2).toBe("v2");
        expect(withoutHistory(replayed.state)).toEqual(ledgerState(aggId, 4));

        // The replacement snapshot written by that replay is clean and verifies.
        const rewritten = await SnapshotOptimizationEngine.getValidSnapshot(aggId, AGGREGATE_TYPE, ws.workspaceId);
        expect(rewritten?.lastEventNumber).toBe(4);
        expect(rewritten?.state).toEqual(ledgerState(aggId, 4));
      } finally {
        await ws.cleanup();
      }
    });
  });

  describe("I. Workspace Isolation Under Replay", () => {
    it("replay of aggregate from workspace A cannot access workspace B events", async () => {
      const workspaceA = randomUUID();
      const workspaceB = randomUUID();
      const aggIdA = "test-agg-ws-a-" + Date.now();

      // Create event in workspace A
      await db.canonicalEvent.create({
        data: eventData({
          workspaceId: workspaceA,
          aggregateId: aggIdA,
          eventNumber: 1,
          eventType: "WS_A_EVENT",
          payload: { secret: "ws-a-only" },
        }),
      });

      // Try to fetch workspace A aggregate using workspace B context
      const eventsAsB = await db.canonicalEvent.findMany({
        where: {
          workspaceId: workspaceB, // Different workspace
          aggregateId: aggIdA, // Same aggregate
        },
      });

      // Should not find it
      expect(eventsAsB.length).toBe(0);

      // Positive control: the event exists for workspace A
      const eventsAsA = await db.canonicalEvent.findMany({
        where: { workspaceId: workspaceA, aggregateId: aggIdA },
      });
      expect(eventsAsA.length).toBe(1);
    });
  });

  describe("J. Deterministic Replay Hash Equality", () => {
    it("replaying same events 3x produces identical hash", async () => {
      const workspaceId = randomUUID();
      const aggId = "test-agg-hash-" + Date.now();
      for (let n = 1; n <= 5; n++) {
        await db.canonicalEvent.create({
          data: eventData({ workspaceId, aggregateId: aggId, eventNumber: n, eventType: `HASH_E${n}`, payload: { n } }),
        });
      }

      const replayHash = async () => {
        const events = await db.canonicalEvent.findMany({
          where: { workspaceId, aggregateId: aggId, aggregateType: AGGREGATE_TYPE },
          orderBy: { eventNumber: "asc" },
        });
        expect(events.length).toBe(5);
        return createHash("sha256").update(JSON.stringify(events)).digest("hex");
      };

      const hash1 = await replayHash();
      const hash2 = await replayHash();
      const hash3 = await replayHash();
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash2).toBe(hash1);
      expect(hash3).toBe(hash1);
    });
  });

  describe("STRESS TESTS: Concurrent Operations", () => {
    it("100 parallel appends maintain ordering", async () => {
      const workspaceId = randomUUID();
      const aggId = "stress-test-parallel-" + Date.now();
      const promises = [];

      for (let i = 1; i <= 100; i++) {
        promises.push(
          db.canonicalEvent.create({
            data: eventData({
              workspaceId,
              aggregateId: aggId,
              eventNumber: i,
              eventType: `STRESS_EVENT_${i}`,
              payload: { sequence: i },
            }),
          })
        );
      }

      await Promise.all(promises);

      // Verify all 100 events exist and are ordered
      const stored = await db.canonicalEvent.findMany({
        where: { workspaceId, aggregateId: aggId },
        orderBy: { eventNumber: "asc" },
      });

      expect(stored.length).toBe(100);
      for (let i = 0; i < stored.length - 1; i++) {
        expect(stored[i].eventNumber).toBeLessThan(stored[i + 1].eventNumber);
      }
      expect(stored.map((e) => e.eventNumber)).toEqual(
        Array.from({ length: 100 }, (_, i) => i + 1)
      );
    });
  });

  describe("INTEGRITY ASSERTIONS", () => {
    it("all events have valid eventNumber >= 1", async () => {
      const events = await db.canonicalEvent.findMany({
        take: 1000,
      });

      for (const evt of events) {
        expect(evt.eventNumber).toBeGreaterThanOrEqual(1);
        expect(typeof evt.eventNumber).toBe("number");
      }
    });

    it("all events have timestamp", async () => {
      const events = await db.canonicalEvent.findMany({
        take: 1000,
      });

      for (const evt of events) {
        expect(evt.occurredAt).toBeDefined();
        expect(evt.occurredAt instanceof Date).toBe(true);
        expect(evt.recordedAt instanceof Date).toBe(true);
      }
    });
  });

  describe("METRICS CAPTURE", () => {
    it("measure append latency", async () => {
      const startTime = performance.now();

      await db.canonicalEvent.create({
        data: eventData({
          workspaceId: randomUUID(),
          aggregateId: "metrics-agg-" + Date.now(),
          eventNumber: 1,
          eventType: "LATENCY_TEST",
          payload: {},
        }),
      });

      const endTime = performance.now();
      const latency = endTime - startTime;

      console.log(`Append latency: ${latency.toFixed(2)}ms`);
      expect(latency).toBeGreaterThanOrEqual(0);
      expect(latency).toBeLessThan(5000); // Sanity check
    });
  });
});
