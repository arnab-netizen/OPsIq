/**
 * Test-isolation proof (RC4): a test file removes ONLY the scheduler rows of workspaces it seeded, never another file's rows,
 * and a scoped producer / drain pass never creates or claims a row of a workspace it does not own. Real PostgreSQL.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedConnected, ownedQboTasks, ownedQboWorkspaceIds, produceOwnedQboTasks, releaseOwnershipForTest, QBO_TEST_ENV } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { seedTenant } from "@/__tests__/owner-outcome/outcome-db-fixtures";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { TASK_NAME_QBO_READ_SYNC } from "@/infra/qbo-sync-tasks";
import { enqueueDueQboReadSyncTasks } from "@/services/scheduler/scheduler-producers";

const mine = () => db.scheduledTask.count({ where: { taskName: TASK_NAME_QBO_READ_SYNC, workspaceId: { in: ownedQboWorkspaceIds() } } });
const foreignWs: string[] = [];

describe.skipIf(!SHOULD_RUN_DB_TESTS)("scheduler-row ownership (real Postgres)", () => {
  // DB-owned cleanup is registered ONLY inside the DB-gated suite: in a non-DB run no hook executes and nothing touches Prisma (a failing cleanup still fails loudly - it is never swallowed).
  afterAll(ownedQboTasks().cleanup); // every task this file's producer calls created for its OWN workspaces
  afterAll(async () => { await db.scheduledTask.deleteMany({ where: { workspaceId: { in: foreignWs } } }); });
  it("cleanup removes this file's rows, leaves a foreign file's rows untouched, and leaves zero owned rows", async () => {
    const sched = new DatabaseSchedulerProvider();
    const c = await seedConnected();
    const other = await seedConnected(); // stands in for a connection another file owns: seeded here, then released from our ownership view
    foreignWs.push(other.t.ws);
    // A "foreign" row: created for a workspace that is not in our ownership set.
    const foreignTenant = await seedTenant();
    foreignWs.push(foreignTenant.ws);
    const foreignTask = await sched.scheduleIdempotent({ taskName: TASK_NAME_QBO_READ_SYNC, payload: { connectionId: randomUUID() }, scheduledFor: new Date(), maxAttempts: 2, workspaceId: foreignTenant.ws, idempotencyKey: `own:${randomUUID()}` });
    // The scoped producer queues for owned workspaces only.
    const scan = await enqueueDueQboReadSyncTasks(QBO_TEST_ENV("sandbox"), { onlyWorkspaceIds: [c.t.ws] });
    expect(scan.enqueued).toBe(1);
    expect(await db.scheduledTask.count({ where: { taskName: TASK_NAME_QBO_READ_SYNC, workspaceId: foreignTenant.ws } })).toBe(1); // the foreign workspace gained nothing
    expect(await mine()).toBeGreaterThanOrEqual(1);

    await ownedQboTasks().cleanup();
    expect(await mine()).toBe(0);
    expect(await db.scheduledTask.findUnique({ where: { id: foreignTask.id } })).not.toBeNull();
  });

  it("RC4 evidence: the helper every scheduler test uses (produceOwnedQboTasks) queues for OWNED workspaces only - an ACTIVE connection of a workspace owned by another file gets no task", async () => {
    const mineC = await seedConnected();
    const theirs = await seedConnected();
    foreignWs.push(theirs.t.ws);
    releaseOwnershipForTest(theirs.t.ws); // from this file's point of view `theirs` now belongs to another test file
    expect(ownedQboWorkspaceIds()).toContain(mineC.t.ws);
    expect(ownedQboWorkspaceIds()).not.toContain(theirs.t.ws);
    await produceOwnedQboTasks(QBO_TEST_ENV("sandbox"));
    expect(await db.scheduledTask.count({ where: { taskName: TASK_NAME_QBO_READ_SYNC, workspaceId: mineC.t.ws } })).toBe(1);
    expect(await db.scheduledTask.count({ where: { taskName: TASK_NAME_QBO_READ_SYNC, workspaceId: theirs.t.ws } })).toBe(0); // not created, hence nothing to leak or claim
  });
});
