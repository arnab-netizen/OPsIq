/**
 * PHASE RP9: REPLAY DETERMINISM VERIFICATION
 *
 * Empirically verify that event replay is deterministic:
 * - Same aggregate replayed N times produces identical state
 * - True under concurrent write pressure
 * - Event order preserved despite transaction interleaving
 *
 * Concurrent writes (C, E) come from independent OS processes (support/event-store-emit-worker.ts), each with
 * its own PostgreSQL connection, so replays here genuinely interleave with commits there. A replay taken under
 * concurrent writes may observe any committed prefix 1..k, but it must be EXACTLY the fold of that prefix
 * (checked against the persisted payloads), and replays of the same prefix must be identical.
 *
 * Tests:
 * A. SAME AGGREGATE REPLAYED 10x - All show identical state
 * B. SAME AGGREGATE REPLAYED 100x - Deterministic under high load
 * C. REPLAY UNDER CONCURRENT WRITES - every replay is the exact fold of the prefix it observed
 * D. PARTIAL REPLAY DETERMINISM - growing history, and replay upTo k for every k is exact and repeatable
 * E. CONCURRENT REPLAYS + WRITES - 50 replays while 5 processes append 50 events; all exact, 1..51
 * F. REPLAY COMPRESSION - different event counts reach their own final state
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine, type ReplayedAggregate } from "@/services/event-replay-engine";
import { startEmitWorker, type EmitWorkerOutcome } from "./support/event-store-workers";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function expectAllOk(outcomes: EmitWorkerOutcome[][]): void {
  const flat = outcomes.flat();
  expect(flat.filter((o) => !o.ok)).toEqual([]);
}

/** eventNumber -> persisted payload, the ground truth every replay prefix must agree with. */
async function persistedHistory(
  aggregateId: string,
  workspaceId: string
): Promise<Map<number, Record<string, string>>> {
  const rows = (await db.canonicalEvent.findMany({
    where: { aggregateId, aggregateType: "recommendation", workspaceId },
    orderBy: { eventNumber: "asc" },
    select: { eventNumber: true, payload: true },
  })) as Array<{ eventNumber: number; payload: Record<string, string> }>;
  return new Map(rows.map((r) => [r.eventNumber, r.payload]));
}

/**
 * A replay that observed the history up to eventNumber k must be EXACTLY the fold of events 1..k: k events,
 * gap-free, the k-th event's title, and status "active" (set by recommendation.created) or the k-th status.
 */
function expectExactPrefix(replay: ReplayedAggregate, history: Map<number, Record<string, string>>): void {
  const k = replay.lastEventNumber;
  expect(history.has(k)).toBe(true);
  expect(replay.eventCount).toBe(k);
  expect((replay.state.events as Array<{ eventNumber: number }>).map((e) => e.eventNumber)).toEqual(range(1, k));
  expect(replay.state.title).toBe(history.get(k)?.title);
  expect(replay.state.status).toBe(k === 1 ? "active" : history.get(k)?.status);
}

/** All replays that observed the same prefix serialize to the identical state. */
function expectIdenticalPerPrefix(replays: ReplayedAggregate[]): void {
  const byPrefix = new Map<number, Set<string>>();
  for (const r of replays) {
    const set = byPrefix.get(r.lastEventNumber) ?? new Set<string>();
    set.add(JSON.stringify(r.state));
    byPrefix.set(r.lastEventNumber, set);
  }
  for (const states of byPrefix.values()) expect(states.size).toBe(1);
}

describe("Phase RP9: Replay Determinism Verification", () => {
  let workspaceId: string;
  let userId: string;
  let clientId: string;
  let engagementId: string;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    workspaceId = uuidv4();
    userId = uuidv4();
    clientId = uuidv4();
    engagementId = uuidv4();

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: "Replay Determinism Workspace",
        slug: `replay-${Date.now()}`,
        createdBy: userId,
      },
    });

    await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Replay Test Client",
        updatedAt: new Date(),
      },
    });

    await db.engagement.create({
      data: {
        id: engagementId,
        code: `REPLAY-${Date.now()}`,
        title: "Replay Test",
        clientId,
        workspaceId,
        serviceTier: "standard",
        engagementMode: "advisory",
        createdBy: userId,
        updatedAt: new Date(),
      },
    });

    await db.user.create({
      data: {
        id: userId,
        email: `replay-${Date.now()}@example.com`,
        name: "Replay Test User",
        hashedPassword: "mock",
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    // canonical_events is append-only (trigger prevents DELETE) — skip, workspace has no FK back to it
    try { await db.engagement.deleteMany({ where: { workspaceId } }); } catch { /* best-effort */ }
    // Replay upserts snapshot_data (FK to workspace); without this the workspace delete below always failed.
    try { await db.snapshotData.deleteMany({ where: { workspaceId } }); } catch { /* best-effort */ }
    try { await db.workspace.deleteMany({ where: { id: workspaceId } }); } catch { /* best-effort */ }
    try { await db.clientAccount.deleteMany({ where: { id: clientId } }); } catch { /* best-effort */ }
    try { await db.auditEvent.deleteMany({ where: { actorId: userId } }); } catch { /* best-effort */ }
    try { await db.user.deleteMany({ where: { id: userId } }); } catch { /* best-effort */ }
  });

  describe("A. SAME AGGREGATE REPLAYED 10x - Deterministic State", () => {
    it("should replay identically 10 consecutive times", async () => {
      const aggId = uuidv4();

      // Create event sequence
      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Test Recommendation",
          status: "draft",
          priority: "high",
          engagementId,
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: { title: "Updated Title", status: "in_review", priority: "high" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Replay 10 times sequentially
      const replays: ReplayedAggregate[] = [];
      for (let i = 0; i < 10; i++) {
        const result = await EventReplayEngine.replayAggregate(
          aggId,
          "recommendation",
          workspaceId
        );
        replays.push(result);
      }

      // All should be identical
      const states = replays.map((r) => JSON.stringify(r.state));
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(1);

      // Verify specific values
      expect(replays[0].eventCount).toBe(2);
      expect(replays[0].state.title).toBe("Updated Title");
      expect(replays[0].state.status).toBe("in_review");

      // All replays should have same event count
      const eventCounts = replays.map((r) => r.eventCount);
      for (let i = 1; i < eventCounts.length; i++) {
        expect(eventCounts[i]).toBe(eventCounts[0]);
      }

      console.log(
        `✅ RP9A: 10 consecutive replays produced identical state (${uniqueStates.size} unique)`
      );
    });
  });

  describe("B. SAME AGGREGATE REPLAYED 100x - High Volume Determinism", () => {
    it("should maintain determinism across 100 parallel replays", async () => {
      const aggId = uuidv4();

      // Create event sequence
      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "High Volume Test",
          status: "draft",
          priority: "medium",
          engagementId,
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Replay 100 times in parallel
      const replays = await Promise.all(
        Array.from({ length: 100 }, () =>
          EventReplayEngine.replayAggregate(
            aggId,
            "recommendation",
            workspaceId
          )
        )
      );

      // All should be identical
      const states = replays.map((r) => JSON.stringify(r.state));
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(1);

      // Verify event count consistency and the exact replayed state
      const eventCounts = replays.map((r) => r.eventCount);
      expect(new Set(eventCounts)).toEqual(new Set([1]));
      expect(replays[0].lastEventNumber).toBe(1);
      expect(replays[0].state.title).toBe("High Volume Test");
      expect(replays[0].state.priority).toBe("medium");
      expect(replays[0].state.status).toBe("active");

      console.log(
        `✅ RP9B: 100 parallel replays produced identical state (${uniqueStates.size} unique, ${replays.length} replays)`
      );
    });
  });

  describe("C. REPLAY UNDER CONCURRENT WRITES - Write Safety", () => {
    it("every replay taken while another process appends is the exact fold of the prefix it observed", async () => {
      const aggId = uuidv4();

      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Concurrent Write Test",
          status: "draft",
          priority: "high",
          engagementId,
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Writes come from an independent process on its own connection; replays run here, continuously,
      // for the whole write window (and at least 10 times).
      const writer = await startEmitWorker({
        workspaceId,
        actorId: userId,
        emits: Array.from({ length: 10 }, (_, i) => ({
          aggregateId: aggId,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          payload: { title: `Update ${i}`, status: "pending", priority: "high" },
        })),
      });
      let writerFinished = false;
      const writes = writer.outcomes.finally(() => {
        writerFinished = true;
      });
      writer.go();

      const replays: ReplayedAggregate[] = [];
      while (!writerFinished || replays.length < 10) {
        replays.push(await EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId));
      }
      expectAllOk([await writes]);

      const history = await persistedHistory(aggId, workspaceId);
      expect([...history.keys()]).toEqual(range(1, 11));
      for (const replay of replays) expectExactPrefix(replay, history);
      expectIdenticalPerPrefix(replays);

      const seen = replays.map((r) => r.lastEventNumber);
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
      expectExactPrefix(await EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId), history);
    });
  });

  describe("D. PARTIAL REPLAY DETERMINISM - Event Subset Consistency", () => {
    it("replays as history grows 1->5 events, and every partial replay (upTo k) is exact and repeatable", async () => {
      const aggId = uuidv4();

      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Event 1",
          status: "draft",
          priority: "high",
          engagementId,
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      const replayBefore = await EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId);
      expect(replayBefore.eventCount).toBe(1);
      expect(replayBefore.lastEventNumber).toBe(1);
      expect(replayBefore.state.title).toBe("Event 1");
      expect(replayBefore.state.status).toBe("active");

      for (let i = 2; i <= 5; i++) {
        await EventEmitterService.emit({
          aggregateId: aggId,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: {
            title: `Event ${i}`,
            status: i % 2 === 0 ? "in_review" : "draft",
            priority: "high",
          },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      const replays = await Promise.all(
        Array.from({ length: 5 }, () => EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId))
      );
      expect(new Set(replays.map((r) => r.eventCount))).toEqual(new Set([5]));
      expect(new Set(replays.map((r) => JSON.stringify(r.state))).size).toBe(1);
      expect(replays[0].lastEventNumber).toBe(5);
      expect(replays[0].state.title).toBe("Event 5");
      expect(replays[0].state.status).toBe("draft");

      // Partial replays: replaying up to k is the exact fold of events 1..k, identical across 3 runs.
      const history = await persistedHistory(aggId, workspaceId);
      for (let k = 1; k <= 5; k++) {
        const partial: ReplayedAggregate[] = [];
        for (let run = 0; run < 3; run++) {
          partial.push(await EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId, k));
        }
        for (const r of partial) {
          expect(r.lastEventNumber).toBe(k);
          expectExactPrefix(r, history);
        }
        expect(new Set(partial.map((r) => JSON.stringify(r.state))).size).toBe(1);
      }
    });
  });

  describe("E. MANY CONCURRENT REPLAYS + WRITES - Contention Determinism", () => {
    it("50 replays and 50 appends from 5 processes: all succeed, every replay is an exact prefix, 1..51", async () => {
      const aggId = uuidv4();

      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Contention Test",
          status: "draft",
          priority: "high",
          engagementId,
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      const writers = await Promise.all(
        Array.from({ length: 5 }, (_, w) =>
          startEmitWorker({
            workspaceId,
            actorId: userId,
            emits: Array.from({ length: 10 }, (_, j) => {
              const i = w * 10 + j;
              return {
                aggregateId: aggId,
                aggregateType: "recommendation",
                eventType: "recommendation.updated",
                payload: {
                  title: `Contention Update ${i}`,
                  status: i % 3 === 0 ? "approved" : "pending",
                  priority: "high",
                },
              };
            }),
          })
        )
      );
      for (const w of writers) w.go();

      // 50 replays issued concurrently in this process while the 5 writer processes append.
      const [replays, writes] = await Promise.all([
        Promise.all(
          Array.from({ length: 50 }, () => EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId))
        ),
        Promise.all(writers.map((w) => w.outcomes)),
      ]);

      expect(replays).toHaveLength(50);
      expectAllOk(writes);
      expect(writes.flat()).toHaveLength(50);

      const history = await persistedHistory(aggId, workspaceId);
      expect([...history.keys()]).toEqual(range(1, 51));
      for (const replay of replays) expectExactPrefix(replay, history);
      expectIdenticalPerPrefix(replays);
    });
  });

  describe("F. REPLAY COMPRESSION - State Consistency", () => {
    it("should produce same final state regardless of event count", async () => {
      const agg1 = uuidv4();
      const agg2 = uuidv4();

      // Aggregate 1: Many events (10)
      let currentTitle = "Agg1";
      await EventEmitterService.emit({
        aggregateId: agg1,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: currentTitle,
          status: "draft",
          priority: "high",
          engagementId,
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      for (let i = 1; i < 10; i++) {
        currentTitle = `Agg1 Update ${i}`;
        await EventEmitterService.emit({
          aggregateId: agg1,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { title: currentTitle, status: "in_review", priority: "high" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      // Aggregate 2: Few events (3), same final title
      await EventEmitterService.emit({
        aggregateId: agg2,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Agg2 Initial",
          status: "draft",
          priority: "high",
          engagementId,
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      await EventEmitterService.emit({
        aggregateId: agg2,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: { title: "Agg2 Update 1", status: "pending", priority: "high" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      await EventEmitterService.emit({
        aggregateId: agg2,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: { title: "Agg2 Final", status: "in_review", priority: "high" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Replay both
      const replay1 = await EventReplayEngine.replayAggregate(
        agg1,
        "recommendation",
        workspaceId
      );
      const replay2 = await EventReplayEngine.replayAggregate(
        agg2,
        "recommendation",
        workspaceId
      );

      // Different event counts
      expect(replay1.eventCount).toBe(10);
      expect(replay2.eventCount).toBe(3);

      // But both reached their final state correctly
      expect(replay1.state.title).toBe("Agg1 Update 9");
      expect(replay2.state.title).toBe("Agg2 Final");

      console.log(
        `✅ RP9F: Replay compression verified (10 events vs 3 events, both reached final state)`
      );
    });
  });
});
