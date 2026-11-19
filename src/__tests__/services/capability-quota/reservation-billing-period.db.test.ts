/**
 * A returned reservation unit lands in the SAME billing period as the reservation, against a real database.
 *
 * Root cause proven here: the release row that returns unsettled units was stamped with the time it was
 * written, while usage is summed per period (`timestamp >= currentPeriodStart`). A reservation made in
 * period P1 and returned after the period boundary (by the expiry sweep, or a completion that finishes
 * after the boundary) left +n in P1 and -n in P2: the new period's usage went negative. The fix stamps
 * the release row with the reserve row's timestamp.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/capability-quota/reservation-billing-period.db.test.ts --maxWorkers=1
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import { getUsage, reconcileExpiredCapabilityReservations, withCapabilityQuota } from "@/services/entitlement.service";

const KEY = "decision:create";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] reservation releases stay in the reservation's billing period", () => {
  const stamp = randomUUID().slice(0, 8);
  const workspaceIds: string[] = [];
  const plans: PlanEntitlementFixture[] = [];

  async function freshWorkspace(): Promise<{ workspaceId: string; subscriptionId: string }> {
    const workspaceId = randomUUID();
    await db.workspace.create({ data: { id: workspaceId, name: `Period ${workspaceIds.length}`, slug: `period-${workspaceIds.length}-${stamp}` } });
    const plan = await seedPlanEntitlement([workspaceId], [KEY], { [KEY]: 10 });
    plans.push(plan);
    workspaceIds.push(workspaceId);
    return { workspaceId, subscriptionId: plan.subscriptionIds[0] };
  }

  async function periodUsage(workspaceId: string): Promise<number> {
    return (await getUsage(workspaceId)).find((u) => u.key === KEY)?.value ?? 0;
  }

  async function usageBefore(workspaceId: string, boundary: Date): Promise<number> {
    const agg = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId, key: KEY, timestamp: { lt: boundary } } });
    return agg._sum.value ?? 0;
  }

  beforeAll(async () => {
    await db.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    if (workspaceIds.length > 0) {
      await db.usageEvent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    }
    for (const p of plans) await cleanupPlanEntitlement(p);
    if (workspaceIds.length > 0) await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("the expiry sweep after a period boundary leaves both periods net zero (reviewer's case)", async () => {
    const { workspaceId, subscriptionId } = await freshWorkspace();
    const reservedAt = new Date(Date.now() - 40 * 60_000);
    const periodStart = new Date(Date.now() - 10 * 60_000);
    // An abandoned reservation from the previous period (its process died 40 minutes ago).
    const reservationId = randomUUID();
    await db.usageEvent.create({
      data: { id: reservationId, workspaceId, key: KEY, value: 1, timestamp: reservedAt, reservationId, reservationEntry: "reserve" },
    });
    await db.subscription.update({ where: { id: subscriptionId }, data: { currentPeriodStart: periodStart } });

    expect(await reconcileExpiredCapabilityReservations(workspaceId)).toEqual({ examined: 1, finalized: 1, unitsReturned: 1 });

    expect(await periodUsage(workspaceId)).toBe(0);
    expect(await usageBefore(workspaceId, periodStart)).toBe(0);
    const release = await db.usageEvent.findFirst({ where: { reservationId, reservationEntry: "release" } });
    expect(release?.timestamp.getTime()).toBe(reservedAt.getTime());
  });

  it("a completion that finishes after a period boundary returns its unit into the reservation's period", async () => {
    const { workspaceId, subscriptionId } = await freshWorkspace();
    await withCapabilityQuota(workspaceId, KEY, async () => {
      // The billing period rolls over while the operation runs; it then settles nothing.
      await new Promise((r) => setTimeout(r, 20));
      await db.subscription.update({ where: { id: subscriptionId }, data: { currentPeriodStart: new Date() } });
    });
    expect(await periodUsage(workspaceId)).toBe(0);
    const total = await db.usageEvent.aggregate({ _sum: { value: true }, where: { workspaceId, key: KEY } });
    expect(total._sum.value ?? 0).toBe(0);
  });
});
