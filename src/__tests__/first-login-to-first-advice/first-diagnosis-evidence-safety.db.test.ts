/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * HOSTILE proof for the automatic first diagnosis (`firstDiagnosisOnly`): it may REPLAY the cycle already committed for the SAME
 * figures (concurrency, double submit, lost HTTP response) but must NEVER hand back advice for DIFFERENT evidence, and must never
 * spend allowance or create a cycle on its own when the evidence moved. Owner-initiated re-runs stay unchanged.
 *
 * The first cases FAIL against the original implementation (it returned the business's latest cycle whatever its snapshot).
 * Run: /var/tmp/dbenv.sh npx vitest run src/__tests__/first-login-to-first-advice/first-diagnosis-evidence-safety.db.test.ts
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { amendFinancialSnapshot, createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createFirstBusiness, getFirstRunContext } from "@/services/owner-first-run/first-run.service";
import { ConflictError } from "@/infra/errors";

async function tenant() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@evsafety.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Evidence Safety Co", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
  return { workspaceId, userId, businessId: business.id };
}
const month = (monthsAgo: number) => {
  const end = new Date();
  end.setUTCDate(0);
  end.setUTCMonth(end.getUTCMonth() - monthsAgo + 1, 0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};
const figures = (over: Record<string, unknown> = {}) => ({ currency: "GBP", revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500, evidenceQuality: "ACTUAL", ...over });
const snap = (t: { workspaceId: string; userId: string; businessId: string }, monthsAgo = 1, over: Record<string, unknown> = {}): Promise<any> =>
  createFinancialSnapshot(t.businessId, { ...month(monthsAgo), ...figures(over) } as any, t.userId, t.workspaceId);
const first = (t: { workspaceId: string; userId: string; businessId: string }, snapshotId: string) =>
  runFinanceDiagnosis(t.businessId, snapshotId, t.userId, t.workspaceId, { firstDiagnosisOnly: true });
const owner = (t: { workspaceId: string; userId: string; businessId: string }, snapshotId: string) => runFinanceDiagnosis(t.businessId, snapshotId, t.userId, t.workspaceId);
const cycles = (t: { workspaceId: string; businessId: string }) => db.ownerFinanceCycle.count({ where: { workspaceId: t.workspaceId, businessId: t.businessId } });

afterEach(() => { delete process.env.BILLING_PAYWALL_ENFORCEMENT; });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] firstDiagnosisOnly never returns advice for different evidence", () => {
  it("[db] SAME snapshot: concurrent and repeated requests replay one cycle", async () => {
    const t = await tenant();
    const s = await snap(t);
    const out: any[] = await Promise.all([first(t, s.id), first(t, s.id), first(t, s.id)]);
    expect(new Set(out.map((c) => c.id)).size).toBe(1);
    expect((await first(t, s.id) as any).id).toBe(out[0].id);
    expect(await cycles(t)).toBe(1);
  });

  it("[db] AMENDED snapshot: a stale first-only request for the new figures is refused, not answered with the old advice", async () => {
    const t = await tenant();
    const s1 = await snap(t);
    const c1: any = await first(t, s1.id);
    const amended: any = await amendFinancialSnapshot(s1.id, { amendmentReason: "corrected revenue", revenue: 3000 } as any, t.userId, t.workspaceId);
    const s2 = amended.snapshot;
    expect(s2.id).not.toBe(s1.id);

    await expect(first(t, s2.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await cycles(t)).toBe(1); // nothing created, nothing charged
    // The product state says the read is out of date (the owner is asked to update it) - it is not presented as current.
    const ctx = await getFirstRunContext(t.workspaceId, t.businessId);
    expect(["FIRST_RESULT", "ESTABLISHED"]).toContain(ctx.state);
    expect(ctx.diagnosisStale).toBe(true);
    // The legitimate path still works: the OWNER re-runs on the new figures and gets a NEW cycle bound to them.
    const c2: any = await owner(t, s2.id);
    expect(c2.id).not.toBe(c1.id);
    expect(c2.snapshotId).toBe(s2.id);
    expect((await getFirstRunContext(t.workspaceId, t.businessId)).diagnosisStale).toBe(false);
  });

  it("[db] HISTORICAL cycle on an older period: first-only on a different period is refused, never answered with the older period's advice", async () => {
    const t = await tenant();
    const older = await snap(t, 2);
    const cOld: any = await first(t, older.id);
    const newer = await snap(t, 1, { revenue: 5000 });
    await expect(first(t, newer.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await cycles(t)).toBe(1);
    // Asking again for the OLD snapshot (a replay of what was committed) is still a faithful replay.
    expect((await first(t, older.id) as any).id).toBe(cOld.id);
  });

  it("[db] CASH BALANCE changed after the cycle: the replay is refused (it would be advice on a superseded balance) and the context says why", async () => {
    const t = await tenant();
    const s = await snap(t);
    await createCashflowSnapshot(t.businessId, { ...month(1), currency: "GBP", cashInHand: 100, bankBalance: 4000, dailyCollections: 100, receivables: 0, receivablesOverdue: 0, payables: 0, upcomingEmi: 0, rentDue: 0, salaryDue: 0, vendorDue: 0, taxDue: 0, ownerWithdrawal: 0 } as any, t.userId, t.workspaceId);
    const c1: any = await first(t, s.id);
    await new Promise((r) => setTimeout(r, 1100));
    await amendCashflowBank(t, 250);
    await expect(first(t, s.id)).rejects.toBeInstanceOf(ConflictError);
    expect(await cycles(t)).toBe(1);
    expect((await getFirstRunContext(t.workspaceId, t.businessId)).staleReason).toBe("CASH_POSITION_CHANGED");
    const c2: any = await owner(t, s.id); // owner-initiated update still works
    expect(c2.id).not.toBe(c1.id);
  });

  it("[db] ISOLATION: another business in the same workspace and another workspace never receive this business's cycle", async () => {
    const a = await tenant();
    const sa = await snap(a);
    const ca: any = await first(a, sa.id);
    const { business: b2 } = await createFirstBusiness(a.workspaceId, a.userId, { businessType: "laundry_local_service", currency: "gbp", name: "Second Shop" } as any).catch(() => ({ business: null as any }));
    if (b2) {
      const sb: any = await createFinancialSnapshot(b2.id, { ...month(1), ...figures() } as any, a.userId, a.workspaceId);
      const cb: any = await runFinanceDiagnosis(b2.id, sb.id, a.userId, a.workspaceId, { firstDiagnosisOnly: true });
      expect(cb.id).not.toBe(ca.id);
      expect(cb.businessId).toBe(b2.id);
    }
    const other = await tenant();
    const so = await snap(other);
    const co: any = await first(other, so.id);
    expect(co.id).not.toBe(ca.id);
    await expect(runFinanceDiagnosis(a.businessId, sa.id, other.userId, other.workspaceId, { firstDiagnosisOnly: true })).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("[db] ALLOWANCE: with the paywall enforced, a replay of the committed first read still works; a re-run is the only thing the allowance gate stops; a refused first-only spends nothing", async () => {
    const t = await tenant();
    const s1 = await snap(t);
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    const c1: any = await first(t, s1.id); // the workspace's one free diagnosis
    expect((await first(t, s1.id) as any).id).toBe(c1.id); // replay: no allowance needed, no new cycle
    expect(await cycles(t)).toBe(1);
    const s2: any = (await amendFinancialSnapshot(s1.id, { amendmentReason: "x", revenue: 2000 } as any, t.userId, t.workspaceId)).snapshot;
    await expect(first(t, s2.id)).rejects.toBeInstanceOf(ConflictError); // not an allowance spend in disguise
    expect(await cycles(t)).toBe(1);
    await expect(owner(t, s2.id)).rejects.toBeTruthy(); // owner-initiated second diagnosis is gated by the allowance exactly as before
    expect(await cycles(t)).toBe(1);
  });

  it("[db] LOST RESPONSE: the cycle committed but the caller never saw it - the retry returns that same cycle with one audit event", async () => {
    const t = await tenant();
    const s = await snap(t);
    const committed: any = await first(t, s.id); // response "lost"
    const retried: any = await first(t, s.id);
    expect(retried.id).toBe(committed.id);
    expect(await db.auditEvent.count({ where: { entityId: committed.id, eventName: "owner.finance_diagnosis_run" } })).toBe(1);
  });
});

async function amendCashflowBank(t: { workspaceId: string; userId: string; businessId: string }, bank: number) {
  const { amendCashflowSnapshot } = await import("@/services/owner-cashflow/snapshot.service");
  const row: any = await db.ownerCashflowSnapshot.findFirstOrThrow({ where: { workspaceId: t.workspaceId, businessId: t.businessId }, orderBy: { createdAt: "desc" } });
  await (amendCashflowSnapshot as any)(row.id, { amendmentReason: "balance moved", bankBalance: bank, confirmReplace: true, expectedUpdatedAt: row.updatedAt.toISOString() }, t.userId, t.workspaceId);
}
