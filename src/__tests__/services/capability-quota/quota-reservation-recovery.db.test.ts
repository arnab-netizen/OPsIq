/**
 * Plan-quota reservation crash recovery, against a real database and real process crashes.
 *
 * Root cause proven here: withCapabilityQuota reserved a unit in its own transaction, then ran the business
 * write, then returned unused units. A process that died in between (or a failed return write) left the
 * reserved unit counted forever: nothing recorded that the unit was only reserved, so nothing could tell an
 * abandoned reservation from consumed usage.
 *
 * The fix records the reservation durably (usage_events reservation rows), settles each kept unit in the
 * SAME transaction as its business write, and reconcileExpiredCapabilityReservations returns the unsettled
 * units of reservations older than the TTL. Crashes are real: the worker process kills itself with SIGKILL.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/capability-quota/quota-reservation-recovery.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import {
  withCapabilityQuota,
  reconcileExpiredCapabilityReservations,
  findWorkspacesWithExpiredCapabilityReservations,
  CAPABILITY_RESERVATION_TTL_MS,
} from "@/services/entitlement.service";
import { runReservationWorkers, type ReservationWorkerExit } from "./support/reservation-workers";

const KEY = "decision:create";
const LIMIT = 5;

interface Ws {
  workspaceId: string;
  actorId: string;
}

async function usageSum(workspaceId: string): Promise<number> {
  const agg = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId, key: KEY } });
  return agg._sum.value ?? 0;
}

async function decisionRows(workspaceId: string): Promise<number> {
  return db.operatorItem.count({ where: { workspaceId } });
}

async function releaseRows(workspaceId: string): Promise<number> {
  return db.usageEvent.count({ where: { workspaceId, reservationEntry: "release" } });
}

function crashed(exit: ReservationWorkerExit): boolean {
  return exit.result === null && (exit.signal !== null || exit.code !== 0);
}

/** A moment after every reservation made so far has expired. */
const afterTtl = () => new Date(Date.now() + CAPABILITY_RESERVATION_TTL_MS + 60_000);

function decisionData(ws: Ws): Prisma.OperatorItemUncheckedCreateInput {
  return {
    id: randomUUID(),
    workspaceId: ws.workspaceId,
    problem: "Reservation in-process proof",
    action: "pricing",
    impactExpected: 1000,
    impactLow: 800,
    impactHigh: 1200,
    confidence: 0.5,
    priorityScore: 500,
    status: "pending",
    ownerUserId: ws.actorId,
    createdByUserId: ws.actorId,
    lastUpdatedByUserId: ws.actorId,
    updatedAt: new Date(),
  };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] plan-quota reservation crash recovery", () => {
  const stamp = randomUUID().slice(0, 8);
  const workspaces: Ws[] = [];
  const plans: PlanEntitlementFixture[] = [];

  async function freshWorkspace(): Promise<Ws> {
    const workspaceId = randomUUID();
    const actorId = randomUUID();
    const n = workspaces.length;
    await db.workspace.create({ data: { id: workspaceId, name: `Reservation ${n}`, slug: `reservation-${n}-${stamp}` } });
    await db.user.create({ data: { id: actorId, email: `${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
    await db.workspaceMembership.create({ data: { userId: actorId, workspaceId, role: "admin", isActive: true } });
    plans.push(await seedPlanEntitlement([workspaceId], [KEY], { [KEY]: LIMIT }));
    const ws = { workspaceId, actorId };
    workspaces.push(ws);
    return ws;
  }

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    const ids = workspaces.map((w) => w.workspaceId);
    if (ids.length > 0) {
      await db.usageEvent.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.operatorItem.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: ids } } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: ids } } });
    }
    for (const p of plans) await cleanupPlanEntitlement(p);
    if (ids.length > 0) {
      await db.user.deleteMany({ where: { id: { in: workspaces.map((w) => w.actorId) } } });
      await db.workspace.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("a process crash after reserve leaves the unit reserved with no business row; the sweep returns it", async () => {
    const ws = await freshWorkspace();
    const [exit] = await runReservationWorkers([{ mode: "crash-after-reserve", workspaceId: ws.workspaceId, actorId: ws.actorId, key: KEY, amount: 2 }]);

    expect(crashed(exit)).toBe(true);
    // The crash left the reservation counted and no decision written.
    expect(await usageSum(ws.workspaceId)).toBe(2);
    expect(await decisionRows(ws.workspaceId)).toBe(0);

    const sweep = await reconcileExpiredCapabilityReservations(ws.workspaceId, afterTtl());
    expect(sweep).toEqual({ examined: 1, finalized: 1, unitsReturned: 2 });
    expect(await usageSum(ws.workspaceId)).toBe(0);
    expect(await releaseRows(ws.workspaceId)).toBe(1);

    const audit = await db.auditEvent.findMany({ where: { workspaceId: ws.workspaceId, eventName: "billing.usage_reservation_recovered" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorType).toBe("system");
    expect(audit[0].actorId).toBeNull();
  });

  it("a settled unit is never returned: crash after the business write committed keeps exactly the settled units", async () => {
    const ws = await freshWorkspace();
    // Reserve 3, write ONE decision with its unit settled in the same transaction, then crash.
    const [exit] = await runReservationWorkers([{ mode: "crash-after-settle", workspaceId: ws.workspaceId, actorId: ws.actorId, key: KEY, amount: 3 }]);

    expect(crashed(exit)).toBe(true);
    expect(await decisionRows(ws.workspaceId)).toBe(1);
    expect(await usageSum(ws.workspaceId)).toBe(3);

    const sweep = await reconcileExpiredCapabilityReservations(ws.workspaceId, afterTtl());
    expect(sweep).toEqual({ examined: 1, finalized: 1, unitsReturned: 2 });
    // Usage equals the decisions that actually persisted.
    expect(await usageSum(ws.workspaceId)).toBe(1);
    expect(await decisionRows(ws.workspaceId)).toBe(1);
  });

  it("a still-in-flight reservation younger than the TTL is never returned, and a late business write after expiry is refused", async () => {
    const ws = await freshWorkspace();
    let releaseOperation!: () => void;
    const gate = new Promise<void>((r) => (releaseOperation = r));
    let reservedSignal!: () => void;
    const reserved = new Promise<void>((r) => (reservedSignal = r));

    const inFlight = withCapabilityQuota(
      ws.workspaceId,
      KEY,
      async (reservation) => {
        reservedSignal();
        await gate;
        return db.$transaction(async (tx: Prisma.TransactionClient) => {
          const row = await tx.operatorItem.create({ data: decisionData(ws) });
          await reservation.settle(tx);
          return row.id;
        });
      }
    );
    await reserved;

    // Sweep at the real current time: the reservation is in flight and younger than the TTL.
    expect(await reconcileExpiredCapabilityReservations(ws.workspaceId, new Date())).toEqual({ examined: 0, finalized: 0, unitsReturned: 0 });
    expect(await usageSum(ws.workspaceId)).toBe(1);

    releaseOperation();
    const id = await inFlight;
    expect(await db.operatorItem.count({ where: { id } })).toBe(1);
    expect(await usageSum(ws.workspaceId)).toBe(1);
    // Finalized normally: the sweep has nothing left to examine even after the TTL.
    expect(await reconcileExpiredCapabilityReservations(ws.workspaceId, afterTtl())).toEqual({ examined: 0, finalized: 0, unitsReturned: 0 });

    // A business write that only arrives after the sweep returned its unit must not keep it.
    let releaseLate!: () => void;
    const lateGate = new Promise<void>((r) => (releaseLate = r));
    let lateReservedSignal!: () => void;
    const lateReserved = new Promise<void>((r) => (lateReservedSignal = r));
    const late = withCapabilityQuota(ws.workspaceId, KEY, async (reservation) => {
      lateReservedSignal();
      await lateGate;
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.operatorItem.create({ data: decisionData(ws) });
        await reservation.settle(tx);
      });
    });
    await lateReserved;
    expect(await usageSum(ws.workspaceId)).toBe(2);
    expect(await reconcileExpiredCapabilityReservations(ws.workspaceId, afterTtl())).toEqual({ examined: 1, finalized: 1, unitsReturned: 1 });
    releaseLate();
    await expect(late).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(await decisionRows(ws.workspaceId)).toBe(1);
    expect(await usageSum(ws.workspaceId)).toBe(1);
    expect(await releaseRows(ws.workspaceId)).toBe(2);
  });

  it("the sweep is idempotent and concurrency-safe: parallel sweeps in separate processes return each unit exactly once", async () => {
    const ws = await freshWorkspace();
    const crashes = await runReservationWorkers([
      { mode: "crash-after-reserve", workspaceId: ws.workspaceId, actorId: ws.actorId, key: KEY, amount: 1 },
      { mode: "crash-after-reserve", workspaceId: ws.workspaceId, actorId: ws.actorId, key: KEY, amount: 2 },
      { mode: "crash-after-settle", workspaceId: ws.workspaceId, actorId: ws.actorId, key: KEY, amount: 2 },
    ]);
    expect(crashes.every(crashed)).toBe(true);
    expect(await usageSum(ws.workspaceId)).toBe(5);
    expect(await decisionRows(ws.workspaceId)).toBe(1);

    const nowIso = afterTtl().toISOString();
    const sweeps = await runReservationWorkers(
      Array.from({ length: 4 }, () => ({ mode: "sweep" as const, workspaceId: ws.workspaceId, actorId: ws.actorId, key: KEY, nowIso }))
    );
    for (const s of sweeps) expect(s.code, s.stderr).toBe(0);
    const results = sweeps.map((s) => s.result!);
    expect(results.reduce((n, r) => n + r.finalized, 0)).toBe(3);
    expect(results.reduce((n, r) => n + r.unitsReturned, 0)).toBe(4);

    // Exactly the persisted decision stays counted; one release row per reservation.
    expect(await usageSum(ws.workspaceId)).toBe(1);
    expect(await releaseRows(ws.workspaceId)).toBe(3);

    // Re-running is a no-op.
    expect(await reconcileExpiredCapabilityReservations(ws.workspaceId, afterTtl())).toEqual({ examined: 0, finalized: 0, unitsReturned: 0 });
    expect(await usageSum(ws.workspaceId)).toBe(1);
  });

  it("is workspace-scoped, and the producer scan finds exactly the workspaces with abandoned reservations", async () => {
    const a = await freshWorkspace();
    const b = await freshWorkspace();
    const exits = await runReservationWorkers([
      { mode: "crash-after-reserve", workspaceId: a.workspaceId, actorId: a.actorId, key: KEY, amount: 1 },
      { mode: "crash-after-reserve", workspaceId: b.workspaceId, actorId: b.actorId, key: KEY, amount: 1 },
    ]);
    expect(exits.every(crashed)).toBe(true);

    const due = await findWorkspacesWithExpiredCapabilityReservations(afterTtl());
    expect(due).toEqual(expect.arrayContaining([a.workspaceId, b.workspaceId]));
    expect(await findWorkspacesWithExpiredCapabilityReservations(new Date())).not.toEqual(expect.arrayContaining([a.workspaceId]));

    expect(await reconcileExpiredCapabilityReservations(a.workspaceId, afterTtl())).toEqual({ examined: 1, finalized: 1, unitsReturned: 1 });
    expect(await usageSum(a.workspaceId)).toBe(0);
    // B is untouched until its own sweep.
    expect(await usageSum(b.workspaceId)).toBe(1);
    expect(await reconcileExpiredCapabilityReservations(b.workspaceId, afterTtl())).toEqual({ examined: 1, finalized: 1, unitsReturned: 1 });
    expect(await usageSum(b.workspaceId)).toBe(0);
  });

  it("validates its input", async () => {
    await expect(reconcileExpiredCapabilityReservations("not-a-uuid")).rejects.toMatchObject({ statusCode: 400 });
    await expect(reconcileExpiredCapabilityReservations(randomUUID(), new Date("invalid"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(reconcileExpiredCapabilityReservations(randomUUID(), new Date(), 1000)).rejects.toMatchObject({ statusCode: 400 });
  });
});
