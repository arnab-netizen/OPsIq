/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * UNATTENDED first read on real PostgreSQL, through the EXISTING scheduler (fake Intuit, real parser/derivation/materialization):
 *   QuickBooks sync task -> canonical evidence -> `owner-first-diagnosis` task -> the one runFinanceDiagnosis -> first read.
 * No browser, no open tab: the owner "closed the page" before any of this ran. Nothing here is a real Intuit acceptance.
 */
import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type FakeIntuit, type MonthBooks } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { getProductionTaskHandlers } from "@/infra/scheduler-handlers";
import { TASK_NAME_QBO_SYNC, createQboSyncTaskHandler, enqueueQboSync, qboSyncKey } from "@/services/quickbooks/qbo-sync-scheduling";
import { TASK_NAME_FIRST_DIAGNOSIS, enqueueFirstDiagnosis, firstDiagnosisKey, firstDiagnosisTaskHandler } from "@/services/owner-first-run/first-diagnosis-scheduling";
import { runFirstDiagnosisIfPending } from "@/services/owner-first-run/first-diagnosis.service";
import { getFirstRunContext } from "@/services/owner-first-run/first-run.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import * as diagnosisModule from "@/services/owner-finance/diagnosis.service";

vi.mock("@/services/owner-finance/diagnosis.service", async (orig) => {
  const m = await orig<typeof import("@/services/owner-finance/diagnosis.service")>();
  return { ...m, runFinanceDiagnosis: vi.fn(m.runFinanceDiagnosis) };
});

const books = (n: number): MonthBooks => ({ income: 20_000 + n, cogs: 9_000, bank: 15_000, arTotal: 8_000, arCurrent: 3_000, apTotal: 6_000, apCurrent: 1_000 });
const allMonths = () => Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)]));
const handlers = (f: FakeIntuit) => new Map<string, TaskHandler>([
  [TASK_NAME_QBO_SYNC, createQboSyncTaskHandler(() => ({ env: envFor("production"), readClientFactory: () => f.reader }))],
  [TASK_NAME_FIRST_DIAGNOSIS, firstDiagnosisTaskHandler],
]);
const cycles = (ws: string, biz: string) => db.ownerFinanceCycle.count({ where: { workspaceId: ws, businessId: biz } });
const fdTasks = (biz: string) => db.scheduledTask.findMany({ where: { taskName: TASK_NAME_FIRST_DIAGNOSIS, idempotencyKey: { startsWith: `first-diagnosis:${biz}:` } }, orderBy: { createdAt: "asc" } });
const dueNow = (id: string) => db.scheduledTask.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
let seq = 0;
async function syncOnce(t: { ws: string; biz: string }, connectionId: string, f: FakeIntuit) {
  const sch = new DatabaseSchedulerProvider();
  const { taskId } = await enqueueQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED", key: qboSyncKey(connectionId, "cont", new Date(), `T${++seq}:${Date.now()}`) });
  return sch.processTaskById(taskId, handlers(f));
}

/** A 12-month baseline takes several bounded passes; each pass that writes evidence may enqueue one (cheap, keyed) task. */
async function completeBaseline(t: { ws: string; biz: string }, connectionId: string, f: FakeIntuit) {
  for (let i = 0; i < 4; i++) expect(await syncOnce(t, connectionId, f)).toBe(true);
  const st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
  expect(st.baselineCompletedAt).not.toBeNull();
}
const drainFirstDiagnosisTasks = async (biz: string, f: FakeIntuit) => {
  const sch = new DatabaseSchedulerProvider();
  for (const task of await fdTasks(biz)) { await dueNow(task.id).catch(() => undefined); await sch.processTaskById(task.id, handlers(f)); }
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] unattended QuickBooks -> first diagnosis via the existing scheduler", () => {
  it("the production registry registers the task (not dead code)", () => {
    expect(getProductionTaskHandlers().has(TASK_NAME_FIRST_DIAGNOSIS)).toBe(true);
  });

  it("[db] HAPPY PATH: a sync that writes evidence enqueues one keyed task; running it creates the first read; owner never needed", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    expect(await syncOnce(t, connectionId, f)).toBe(true);

    const tasks = await fdTasks(t.biz);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ workspaceId: t.ws, maxAttempts: 3 });
    expect(tasks[0].payload).toEqual({ connectionId, businessId: t.biz }); // no actor, no snapshot: those are re-derived at run time
    expect((await getFirstRunContext(t.ws, t.biz)).state).toBe("NEEDS_DIAGNOSIS");
    expect(await cycles(t.ws, t.biz)).toBe(0); // the sync itself never decides

    expect(await new DatabaseSchedulerProvider().processTaskById(tasks[0].id, handlers(f))).toBe(true);
    expect(await cycles(t.ws, t.biz)).toBe(1);
    const ctx = await getFirstRunContext(t.ws, t.biz);
    expect(["FIRST_RESULT", "ESTABLISHED"]).toContain(ctx.state);
    const cycle = await db.ownerFinanceCycle.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz } });
    expect(cycle.snapshotId).toBe(ctx.currentSnapshotId);
    expect(await db.auditEvent.count({ where: { entityId: cycle.id, eventName: "owner.finance_diagnosis_run" } })).toBe(1);
  });

  it("[db] DUPLICATES: same key = one task; re-processing, a repeated handler run and an unchanged re-sync create nothing more", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await completeBaseline(t, connectionId, f);
    const tasks = await fdTasks(t.biz);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const task = tasks[0];
    const at = new Date(Number(task.idempotencyKey.split(":")[2]));
    const dupes = await Promise.all([1, 2, 3].map(() => enqueueFirstDiagnosis({ workspaceId: t.ws, businessId: t.biz, connectionId, evidenceWrittenAt: at })));
    expect(new Set(dupes.map((d) => d.taskId)).size).toBe(1);
    expect(dupes.some((d) => d.created)).toBe(false);
    expect(firstDiagnosisKey(t.biz, at)).toBe(task.idempotencyKey);

    const sch = new DatabaseSchedulerProvider();
    expect(await sch.processTaskById(task.id, handlers(f))).toBe(true);
    expect(await sch.processTaskById(task.id, handlers(f))).toBe(false); // finished task is not re-run
    await drainFirstDiagnosisTasks(t.biz, f); // every later task finds the read already there
    expect(await runFirstDiagnosisIfPending({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor })).toMatchObject({ status: "NOT_PENDING" });
    const before = (await fdTasks(t.biz)).length;
    await syncOnce(t, connectionId, f); // identical books after the baseline: no canonical writes -> no new task (a duplicate webhook is the same)
    expect((await fdTasks(t.biz)).length).toBe(before);
    expect(await cycles(t.ws, t.biz)).toBe(1);
  });

  it("[db] CONCURRENT executions (two workers / a retry after a crash) produce exactly one read and one audit event", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await syncOnce(t, connectionId, f);
    const out = await Promise.all(Array.from({ length: 5 }, () => runFirstDiagnosisIfPending({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor })));
    expect(out.filter((o) => o.status === "DIAGNOSED").length).toBeGreaterThanOrEqual(1);
    expect(out.every((o) => o.status === "DIAGNOSED" || o.status === "NOT_PENDING")).toBe(true);
    expect(await cycles(t.ws, t.biz)).toBe(1);
    const cycle = await db.ownerFinanceCycle.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz } });
    expect(await db.auditEvent.count({ where: { entityId: cycle.id, eventName: "owner.finance_diagnosis_run" } })).toBe(1);
  });

  it("[db] INSUFFICIENT evidence: connected but nothing usable yet -> no read, no error, no allowance", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const r = await runFirstDiagnosisIfPending({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor });
    expect(r).toEqual({ status: "NOT_PENDING", state: "NEEDS_EVIDENCE" });
    const task = await enqueueFirstDiagnosis({ workspaceId: t.ws, businessId: t.biz, connectionId, evidenceWrittenAt: new Date() });
    expect(await new DatabaseSchedulerProvider().processTaskById(task.taskId, handlers(makeFakeIntuit(allMonths())))).toBe(true);
    expect((await db.scheduledTask.findUniqueOrThrow({ where: { id: task.taskId } })).status).toBe("completed");
    expect(await cycles(t.ws, t.biz)).toBe(0);
  });

  it("[db] MANUAL OVERRIDE: an owner-authored month stays authoritative and the unattended read is built on the canonical head", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const key = monthKeys(12)[0];
    const [y, m] = key.split("-").map(Number);
    const manual: any = await createFinancialSnapshot(t.biz, { periodStart: key, periodEnd: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), currency: "USD", revenue: 777, fixedCosts: 100, variableCosts: 100, cashOnHand: 50, evidenceQuality: "ACTUAL" } as any, t.actor, t.ws);
    const f = makeFakeIntuit(allMonths());
    await syncOnce(t, connectionId, f);
    const [task] = await fdTasks(t.biz);
    if (task) await new DatabaseSchedulerProvider().processTaskById(task.id, handlers(f));
    const head = (await getFirstRunContext(t.ws, t.biz)).currentSnapshotId;
    const cycle = await db.ownerFinanceCycle.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz } });
    expect(cycle.snapshotId).toBe(head);
    const current = await db.ownerFinancialSnapshot.findMany({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: new Date(`${key}T00:00:00.000Z`), supersededById: null } });
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(manual.id);
    expect(await cycles(t.ws, t.biz)).toBe(1);
  });

  it("[db] STALE: after the first read, QuickBooks amending the figures does NOT auto-spend a second diagnosis (the owner is asked to update)", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await completeBaseline(t, connectionId, f);
    await drainFirstDiagnosisTasks(t.biz, f);
    expect(await cycles(t.ws, t.biz)).toBe(1);
    const latest = monthKeys(12)[0];
    f.books.set(latest, { ...books(0), income: 4_000 });
    await syncOnce(t, connectionId, f);
    await drainFirstDiagnosisTasks(t.biz, f);
    expect(await cycles(t.ws, t.biz)).toBe(1); // the unattended path only ever produces the FIRST read
    expect((await getFirstRunContext(t.ws, t.biz)).diagnosisStale).toBe(true);
  });

  it("[db] FAILURE then RETRY: a failed diagnosis leaves the evidence untouched, the scheduler retries, and the retry creates the single read", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await syncOnce(t, connectionId, f);
    const [task] = await fdTasks(t.biz);
    vi.mocked(diagnosisModule.runFinanceDiagnosis).mockRejectedValueOnce(new Error("transient database failure"));
    const sch = new DatabaseSchedulerProvider();
    expect(await sch.processTaskById(task.id, handlers(f))).toBe(false);
    const after = await db.scheduledTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.status).not.toBe("completed");
    expect(await cycles(t.ws, t.biz)).toBe(0);
    expect((await getFirstRunContext(t.ws, t.biz)).state).toBe("NEEDS_DIAGNOSIS"); // still resumable, evidence intact
    await dueNow(task.id);
    expect(await sch.processTaskById(task.id, handlers(f))).toBe(true);
    expect(await cycles(t.ws, t.biz)).toBe(1);
  });

  it("[db] ISOLATION: a test (fixture) business is never diagnosed unattended; a payload naming another tenant's business does nothing", async () => {
    const fx = await seedQboTenant({ fixture: true });
    expect(await runFirstDiagnosisIfPending({ workspaceId: fx.ws, businessId: fx.biz, actorId: fx.actor })).toEqual({ status: "NOT_PENDING", state: "NO_REAL_BUSINESS" });

    const a = await seedQboTenant(); const b = await seedQboTenant();
    const ca = await connectQbo(a); await connectQbo(b);
    const f = makeFakeIntuit(allMonths());
    await syncOnce(a, ca.connectionId, f);
    // task claims workspace B but names A's connection/business
    const forged = await new DatabaseSchedulerProvider().scheduleIdempotent({
      taskName: TASK_NAME_FIRST_DIAGNOSIS, payload: { connectionId: ca.connectionId, businessId: a.biz }, scheduledFor: new Date(), maxAttempts: 3, workspaceId: b.ws, idempotencyKey: `forged:${Date.now()}:${a.biz}`,
    });
    expect(await new DatabaseSchedulerProvider().processTaskById(forged.id, handlers(f))).toBe(true);
    expect(await cycles(a.ws, a.biz)).toBe(0);
    expect(await cycles(b.ws, b.biz)).toBe(0);
  });
});
