/**
 * RP1 regression: EventReplayEngine snapshot boundary and upToEventNumber bounds.
 *
 * Runs in the DB lane only (vitest.config.ts excludes runtime-proof/** unless
 * TEST_WITH_DB=true). Real PostgreSQL, no mocks.
 *
 * Contract under test (src/services/event-replay-engine.ts):
 *  - A snapshot persisted at eventNumber S covers events 1..S. Replay that uses it
 *    must apply events S+1..N, each exactly once, in order.
 *  - replayAggregate(..., upToEventNumber = U) returns the state as of event U:
 *    no event > U is applied and no event <= U is applied twice, whether or not a
 *    snapshot exists and whatever eventNumber that snapshot is at.
 *  - Snapshot-assisted replay and full replay produce the same derived state
 *    (everything except the per-replay `events` history, which snapshots
 *    deliberately do not persist: commit 3ce4af26c).
 *
 * Snapshots are only persisted when the workspace row exists (SnapshotData has a
 * FK to Workspace), so each test creates a real workspace.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash, randomUUID } from "crypto";
import { db } from "@/lib/db";
import { EventReplayEngine } from "@/services/event-replay-engine";
import { SnapshotOptimizationEngine } from "@/services/snapshot-optimization-engine";
import { ProjectionRebuildEngine } from "@/services/projection-rebuild-engine";

const AGGREGATE_TYPE = "recommendation";
const ACTOR = randomUUID();

type Replayed = Awaited<ReturnType<typeof EventReplayEngine.replayAggregate>>;

function appliedEventNumbers(r: Replayed): number[] {
  return ((r.state.events as Array<{ eventNumber: number }>) ?? []).map((e) => e.eventNumber);
}

function derivedState(r: Replayed): Record<string, unknown> {
  const rest = { ...r.state };
  delete rest.events;
  return rest;
}

function stableHash(value: Record<string, unknown>): string {
  const sorted = Object.keys(value)
    .sort()
    .map((k) => [k, value[k]]);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

/** Independent oracle: the generic fold (Object.assign of each payload) for events 1..n. */
function expectedLedgerState(aggregateId: string, n: number): Record<string, unknown> {
  const state: Record<string, unknown> = { aggregateId, aggregateType: AGGREGATE_TYPE };
  for (let i = 1; i <= n; i++) {
    state[`k${i}`] = `v${i}`;
    state.last = i;
  }
  return state;
}

describe("RP1 regression: replay snapshot boundary + upToEventNumber bounds", () => {
  let workspaceId: string;

  async function appendLedger(aggregateId: string, from: number, to: number) {
    for (let n = from; n <= to; n++) {
      await db.canonicalEvent.create({
        data: {
          workspaceId,
          aggregateId,
          aggregateType: AGGREGATE_TYPE,
          eventNumber: n,
          eventType: "ledger.entry_recorded",
          payload: { [`k${n}`]: `v${n}`, last: n },
          actorId: ACTOR,
          causationId: randomUUID(),
          correlationId: randomUUID(),
          occurredAt: new Date(),
        },
      });
    }
  }

  async function snapshotEventNumber(aggregateId: string): Promise<number | null> {
    const snap = await db.snapshotData.findFirst({
      where: { workspaceId, aggregateId, aggregateType: AGGREGATE_TYPE },
    });
    return snap?.eventNumber ?? null;
  }

  async function freshFullReplay(aggregateId: string, upTo?: number): Promise<Replayed> {
    await SnapshotOptimizationEngine.invalidateSnapshot(aggregateId, AGGREGATE_TYPE, workspaceId);
    const r = await EventReplayEngine.replayAggregate(aggregateId, AGGREGATE_TYPE, workspaceId, upTo);
    expect(r.usedSnapshot).toBe(false);
    return r;
  }

  beforeEach(async () => {
    workspaceId = randomUUID();
    await db.workspace.create({
      data: { id: workspaceId, name: "RP1 replay boundary", slug: `rp1-replay-${workspaceId}`, createdBy: ACTOR },
    });
  });

  afterEach(async () => {
    // canonical_events is append-only; only the snapshot rows and workspace are removable.
    await db.snapshotData.deleteMany({ where: { workspaceId } });
    await db.recommendation.deleteMany({ where: { workspaceId } });
    await db.engagement.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("applies event S+1 after a snapshot at S: every event 1..N exactly once", async () => {
    const aggId = "rp1-boundary-" + randomUUID();
    await appendLedger(aggId, 1, 3);

    const first = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId);
    expect(first.usedSnapshot).toBe(false);
    expect(appliedEventNumbers(first)).toEqual([1, 2, 3]);
    expect(await snapshotEventNumber(aggId)).toBe(3);

    await appendLedger(aggId, 4, 6);
    const second = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId);

    expect(second.usedSnapshot).toBe(true);
    // Snapshot covers 1..3; the tail must be exactly 4..6 (no gap at S+1, no repeats).
    expect(appliedEventNumbers(second)).toEqual([4, 5, 6]);
    expect(second.eventCount).toBe(3);
    expect(second.lastEventNumber).toBe(6);
    expect(second.version).toBe(6);
    expect(second.state.k4).toBe("v4");
    expect(derivedState(second)).toEqual(expectedLedgerState(aggId, 6));
    expect(await snapshotEventNumber(aggId)).toBe(6);

    // No new events: snapshot alone is the complete state.
    const third = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId);
    expect(third.usedSnapshot).toBe(true);
    expect(appliedEventNumbers(third)).toEqual([]);
    expect(third.lastEventNumber).toBe(6);
    expect(third.version).toBe(6);
    expect(derivedState(third)).toEqual(expectedLedgerState(aggId, 6));
  });

  it("upToEventNumber below the snapshot never leaks later events or double-applies earlier ones", async () => {
    const aggId = "rp1-upto-below-" + randomUUID();
    await appendLedger(aggId, 1, 6);
    await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId);
    expect(await snapshotEventNumber(aggId)).toBe(6);

    const asOf3 = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId, 3);
    expect(asOf3.usedSnapshot).toBe(false);
    expect(appliedEventNumbers(asOf3)).toEqual([1, 2, 3]);
    expect(asOf3.lastEventNumber).toBe(3);
    expect(asOf3.version).toBe(3);
    expect(asOf3.state.k4).toBeUndefined();
    expect(asOf3.state.k6).toBeUndefined();
    expect(derivedState(asOf3)).toEqual(expectedLedgerState(aggId, 3));

    // A bounded historical replay must not corrupt the head state served afterwards.
    const head = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId);
    expect(derivedState(head)).toEqual(expectedLedgerState(aggId, 6));
    expect(head.lastEventNumber).toBe(6);
    expect(head.version).toBe(6);
  });

  it("upToEventNumber above the snapshot applies exactly S+1..U", async () => {
    const aggId = "rp1-upto-above-" + randomUUID();
    await appendLedger(aggId, 1, 2);
    await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId);
    expect(await snapshotEventNumber(aggId)).toBe(2);
    await appendLedger(aggId, 3, 7);

    const asOf5 = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId, 5);
    expect(asOf5.usedSnapshot).toBe(true);
    expect(appliedEventNumbers(asOf5)).toEqual([3, 4, 5]);
    expect(asOf5.lastEventNumber).toBe(5);
    expect(asOf5.version).toBe(5);
    expect(asOf5.state.k6).toBeUndefined();
    expect(derivedState(asOf5)).toEqual(expectedLedgerState(aggId, 5));

    // Equal to the snapshot point: snapshot state only, nothing re-applied.
    await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId);
    expect(await snapshotEventNumber(aggId)).toBe(7);
    const asOf7 = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId, 7);
    expect(asOf7.usedSnapshot).toBe(true);
    expect(appliedEventNumbers(asOf7)).toEqual([]);
    expect(asOf7.lastEventNumber).toBe(7);
    expect(derivedState(asOf7)).toEqual(expectedLedgerState(aggId, 7));
  });

  it("replay hash is identical for full replay and snapshot-assisted replay, at head and at every bound", async () => {
    const aggId = "rp1-hash-" + randomUUID();
    await appendLedger(aggId, 1, 4);
    await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId); // snapshot at 4
    await appendLedger(aggId, 5, 8);

    const assisted = [
      await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId),
      await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId),
      await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId),
    ];
    expect(assisted.every((r) => r.usedSnapshot)).toBe(true);
    const full = await freshFullReplay(aggId);
    const oracle = stableHash(expectedLedgerState(aggId, 8));
    expect(stableHash(derivedState(full))).toBe(oracle);
    for (const r of assisted) expect(stableHash(derivedState(r))).toBe(oracle);

    for (let u = 1; u <= 8; u++) {
      await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId); // snapshot at head
      const bounded = await EventReplayEngine.replayAggregate(aggId, AGGREGATE_TYPE, workspaceId, u);
      expect(stableHash(derivedState(bounded))).toBe(stableHash(expectedLedgerState(aggId, u)));
      expect(bounded.lastEventNumber).toBe(u);
      expect(bounded.version).toBe(u);
    }
  });

  it("projection fields from snapshot-assisted replay equal full replay and the rebuilt projection", async () => {
    const clientId = randomUUID();
    const engagementId = randomUUID();
    await db.clientAccount.create({ data: { id: clientId, name: "RP1 client", createdBy: ACTOR, updatedAt: new Date() } });
    await db.engagement.create({
      data: {
        id: engagementId,
        workspaceId,
        clientId,
        createdBy: ACTOR,
        title: "RP1 engagement",
        code: `RP1-${engagementId}`,
        serviceTier: "standard",
        engagementMode: "advisory",
        updatedAt: new Date(),
      },
    });
    const recId = randomUUID();
    const base = {
      workspaceId,
      aggregateId: recId,
      aggregateType: AGGREGATE_TYPE,
      actorId: ACTOR,
      occurredAt: new Date(),
    };
    await db.canonicalEvent.create({
      data: {
        ...base,
        eventNumber: 1,
        eventType: "recommendation.created",
        causationId: randomUUID(),
        correlationId: randomUUID(),
        payload: {
          engagementId,
          title: "T1",
          description: "D1",
          priority: "high",
          evidenceValidationScore: "0.85",
          reliabilityLevel: "high",
          kpiHealthScore: "0.72",
          kpiRiskLevel: "medium",
        },
      },
    });
    await EventReplayEngine.replayAggregate(recId, AGGREGATE_TYPE, workspaceId);
    expect(await snapshotEventNumber(recId)).toBe(1);

    await db.canonicalEvent.create({
      data: { ...base, eventNumber: 2, eventType: "recommendation.priority_updated", causationId: randomUUID(), correlationId: randomUUID(), payload: { priority: "critical" } },
    });
    await db.canonicalEvent.create({
      data: { ...base, eventNumber: 3, eventType: "recommendation.updated", causationId: randomUUID(), correlationId: randomUUID(), payload: { title: "T3" } },
    });

    const pick = (s: Record<string, unknown>) => ({
      engagementId: s.engagementId,
      title: s.title,
      description: s.description ?? null,
      priority: s.priority,
      evidenceValidationScore: s.evidenceValidationScore,
      reliabilityLevel: s.reliabilityLevel,
      kpiHealthScore: s.kpiHealthScore,
      kpiRiskLevel: s.kpiRiskLevel,
    });

    const assisted = await EventReplayEngine.replayAggregate(recId, AGGREGATE_TYPE, workspaceId);
    expect(assisted.usedSnapshot).toBe(true);
    expect(appliedEventNumbers(assisted)).toEqual([2, 3]);
    const full = await freshFullReplay(recId);
    expect(appliedEventNumbers(full)).toEqual([1, 2, 3]);
    expect(pick(assisted.state)).toEqual(pick(full.state));
    expect(pick(full.state)).toMatchObject({ title: "T3", priority: "critical" });

    const rebuild = await ProjectionRebuildEngine.rebuildRecommendationProjection(recId, workspaceId);
    expect(rebuild.errors).toEqual([]);
    expect(rebuild.success).toBe(true);
    expect(rebuild.parityCheckPassed).toBe(true);
    const row = await db.recommendation.findUniqueOrThrow({ where: { id: recId } });
    expect(pick(row as unknown as Record<string, unknown>)).toEqual(pick(full.state));
  });
});
