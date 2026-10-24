/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows and service payloads are untyped in DB fixtures */
/**
 * Dormant commercial gate, through the REAL diagnosis writers on real Postgres.
 *
 * Proves the first-diagnosis invariant and its race safety with no schema change, the full
 * subscription state matrix, tenant isolation, and that BILLING_PAYWALL_ENFORCEMENT=off changes nothing.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/billing/commercial-gate.db.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { workspaceHasDiagnosis } from "@/services/billing/commercial-policy.service";

const actor = randomUUID();
const DAY = 86_400_000;
const CASH = { cashInHand: 100, bankBalance: 0, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };
const businesses: string[] = [];
const workspaces: string[] = [];
const fixtures: Array<{ plan: string; ba: string; sub: string; ws: string }> = [];

const iso = (d: Date) => d.toISOString().slice(0, 10);
function period(endDaysAgo: number, length = 20) {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
}
async function biz(ws: string, name: string): Promise<string> {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, ws);
  businesses.push(b.id as string);
  return b.id as string;
}
async function cash(ws: string, b: string, endDaysAgo = 3) {
  const snap = await createCashflowSnapshot(b, { ...period(endDaysAgo), currency: "INR", ...CASH }, actor, ws);
  return runCashflowDiagnosis(b, snap.id, actor, ws);
}
async function fin(ws: string, b: string) {
  const snap = await createFinancialSnapshot(b, { ...period(3), currency: "INR", revenue: 500000, costOfGoods: 200000, fixedCosts: 100000, variableCosts: 50000, cashOnHand: 300000 } as any, actor, ws);
  return runFinanceDiagnosis(b, snap.id, actor, ws);
}
async function subscribe(ws: string, status: string, periodEndOffsetDays: number) {
  await db.workspace.create({ data: { id: ws, name: `Gate ${ws.slice(0, 6)}`, slug: `gate-${ws.slice(0, 12)}` } });
  workspaces.push(ws);
  const plan = randomUUID(), ba = randomUUID(), sub = randomUUID(), now = new Date();
  await db.plan.create({ data: { id: plan, name: `Gate plan ${plan.slice(0, 8)}`, priceMonthly: 0, priceYearly: 0, updatedAt: now } });
  await db.billingAccount.create({ data: { id: ba, workspaceId: ws, providerCustomerId: `cus_${ba}`, updatedAt: now } });
  await db.subscription.create({
    data: { id: sub, billingAccountId: ba, planId: plan, status, currentPeriodStart: new Date(now.getTime() - 30 * DAY), currentPeriodEnd: new Date(now.getTime() + periodEndOffsetDays * DAY), updatedAt: now },
  });
  fixtures.push({ plan, ba, sub, ws });
}
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ statusCode: 402, code: "PLAN_LIMIT_EXCEEDED" });
async function cycleCount(b: string): Promise<number> {
  return (await db.ownerCashflowCycle.count({ where: { businessId: b } })) + (await db.ownerFinanceCycle.count({ where: { businessId: b } }));
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] dormant commercial gate on the real diagnosis writers", () => {
  const prev = process.env.BILLING_PAYWALL_ENFORCEMENT;
  beforeAll(async () => {
    await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `gate-${actor}@example.com`, name: "Gate QA", isActive: true, updatedAt: new Date() } });
  });
  beforeEach(() => { process.env.BILLING_PAYWALL_ENFORCEMENT = "on"; });
  afterEach(() => { if (prev === undefined) delete process.env.BILLING_PAYWALL_ENFORCEMENT; else process.env.BILLING_PAYWALL_ENFORCEMENT = prev; });
  afterAll(async () => {
    for (const b of businesses) await teardownOwnerBusiness(b).catch(() => undefined);
    for (const f of fixtures) {
      await db.subscription.deleteMany({ where: { id: f.sub } });
      await db.billingAccount.deleteMany({ where: { id: f.ba } });
      await db.plan.deleteMany({ where: { id: f.plan } });
    }
    await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  });

  it("OFF: unchanged behaviour: any number of diagnoses succeed with no subscription", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
    const ws = randomUUID();
    const b = await biz(ws, "Gate off");
    await cash(ws, b, 10);
    await cash(ws, b, 6);
    await fin(ws, b);
    expect(await cycleCount(b)).toBe(3);
  });

  it("ON, unpaid: first diagnosis is free; the second (same domain) is denied with a 402 and writes nothing", async () => {
    const ws = randomUUID();
    const b = await biz(ws, "Gate first");
    expect(await workspaceHasDiagnosis(db as any, ws)).toBe(false);
    await cash(ws, b, 10);
    expect(await workspaceHasDiagnosis(db as any, ws)).toBe(true);
    await denied(cash(ws, b, 6));
    expect(await cycleCount(b)).toBe(1);
  });

  it("ON, unpaid: the allowance is per workspace: another domain and another business are both denied", async () => {
    const ws = randomUUID();
    const b1 = await biz(ws, "Gate ws A");
    const b2 = await biz(ws, "Gate ws B");
    await cash(ws, b1, 10);
    await denied(fin(ws, b1));
    await denied(cash(ws, b2, 6));
    await denied(fin(ws, b2));
    expect(await cycleCount(b2)).toBe(0);
  });

  it("ON: tenant isolation: another workspace's usage never consumes this workspace's free diagnosis", async () => {
    const wsA = randomUUID(), wsB = randomUUID();
    const a = await biz(wsA, "Gate tenant A");
    const b = await biz(wsB, "Gate tenant B");
    await cash(wsA, a, 10);
    await expect(cash(wsB, b, 10)).resolves.toBeTruthy();
    await denied(cash(wsA, a, 6));
  });

  it("ON, race: concurrent first diagnoses in different domains/businesses of one workspace => exactly one is free", async () => {
    const ws = randomUUID();
    const b1 = await biz(ws, "Gate race 1");
    const b2 = await biz(ws, "Gate race 2");
    const s1 = await createCashflowSnapshot(b1, { ...period(3), currency: "INR", ...CASH }, actor, ws);
    const s2 = await createFinancialSnapshot(b2, { ...period(3), currency: "INR", revenue: 500000, costOfGoods: 200000, fixedCosts: 100000, variableCosts: 50000, cashOnHand: 300000 } as any, actor, ws);
    const results = await Promise.allSettled([runCashflowDiagnosis(b1, s1.id, actor, ws), runFinanceDiagnosis(b2, s2.id, actor, ws)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 402, code: "PLAN_LIMIT_EXCEEDED" });
    expect((await cycleCount(b1)) + (await cycleCount(b2))).toBe(1);
  });

  it("ON, race: many concurrent first diagnoses of the same business => exactly one cycle", async () => {
    const ws = randomUUID();
    const b = await biz(ws, "Gate race N");
    const snaps = await Promise.all([10, 8, 6, 4].map((d) => createCashflowSnapshot(b, { ...period(d, 2), currency: "INR", ...CASH }, actor, ws)));
    const results = await Promise.allSettled(snaps.map((s) => runCashflowDiagnosis(b, s.id, actor, ws)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await cycleCount(b)).toBe(1);
  });

  describe("subscription state matrix (a diagnosis already exists, so only entitlement can allow the next)", () => {
    it.each([
      ["active", 10, true],
      ["active with scheduled cancellation (still active)", 10, true],
      ["past_due inside the 7-day grace", -3, true],
      ["past_due, grace expired", -30, false],
      ["paused", 10, false],
      ["canceled", 10, false],
    ] as const)("%s", async (label, offset, allowed) => {
      const ws = randomUUID();
      const status = label.startsWith("active") ? "active" : label.split(",")[0].split(" ")[0];
      await subscribe(ws, status, offset);
      const b = await biz(ws, `Gate state ${label.slice(0, 12)}`);
      await cash(ws, b, 10);
      if (allowed) await expect(cash(ws, b, 6)).resolves.toBeTruthy();
      else await denied(cash(ws, b, 6));
    });

    it("subscribing after the free diagnosis was used re-opens the loop", async () => {
      const ws = randomUUID();
      const b = await biz(ws, "Gate upgrade");
      await cash(ws, b, 10);
      // Data entry stays free: the snapshot persists even though its diagnosis is refused.
      const snap = await createCashflowSnapshot(b, { ...period(3), currency: "INR", ...CASH }, actor, ws);
      await denied(runCashflowDiagnosis(b, snap.id, actor, ws));
      await subscribe(ws, "active", 20);
      await expect(runCashflowDiagnosis(b, snap.id, actor, ws)).resolves.toBeTruthy();
    });
  });
});
