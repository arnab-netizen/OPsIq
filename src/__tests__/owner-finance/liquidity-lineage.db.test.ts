/**
 * A1 amendment — cash semantics resolved through the REAL amendment lineage (`[db]`-gated, throwaway
 * local Postgres only). Rows are created with explicit createdAt so pre-/post-cutover cases are exact.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { loadFinanceEngineInput, resolveFinancialSnapshotCashSemantics } from "@/services/owner-finance/liquidity.service";
import { resolveLiquidity } from "@/domain/owner-finance/liquidity";
import { seedKnownBank } from "../test-helpers/seed-known-bank";

const actor = randomUUID();
const PRE = new Date("2026-09-20T10:00:00Z");
const POST = new Date("2026-10-10T10:00:00Z");
const POST2 = new Date("2026-10-12T10:00:00Z");
const PERIOD = { start: "2026-09-01", end: "2026-09-30" };

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `a1-lineage-${actor}@example.com`, name: "A1 Lineage", isActive: true, updatedAt: new Date() } });
});

async function biz(workspaceId = randomUUID()) {
  const b = await createBusiness({ name: "A1 Lineage", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return { workspaceId, businessId: b.id };
}

async function row(ws: string, businessId: string, o: { createdAt: Date; cashOnHand: number | null; version?: number; changedFields?: string[]; supersededById?: string | null; id?: string; period?: { start: string; end: string } }) {
  const p = o.period ?? PERIOD;
  const id = o.id ?? randomUUID();
  await db.ownerFinancialSnapshot.create({
    data: {
      id, workspaceId: ws, businessId, periodStart: new Date(p.start), periodEnd: new Date(p.end), currency: "INR",
      revenue: 100000, fixedCosts: 130000, cashOnHand: o.cashOnHand, version: o.version ?? 1,
      changedFields: o.changedFields ?? undefined, supersededById: o.supersededById ?? null,
      createdAt: o.createdAt, dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
  return id;
}
async function link(oldId: string, newId: string) {
  await db.ownerFinancialSnapshot.update({ where: { id: oldId }, data: { supersededById: newId } });
}
const sem = async (ws: string, id: string) => {
  const r = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id } });
  return resolveFinancialSnapshotCashSemantics(r, ws);
};

describe("[db] A1 amendment — cash semantics through the amendment lineage", () => {
  it("[db] 1. original legacy row before the cutover → LEGACY_AMBIGUOUS", async () => {
    const { workspaceId, businessId } = await biz();
    const id = await row(workspaceId, businessId, { createdAt: PRE, cashOnHand: 130000 });
    expect(await sem(workspaceId, id)).toBe("LEGACY_AMBIGUOUS");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 2. original physical row after the deployment cutover → PHYSICAL_ONLY", async () => {
    const { workspaceId, businessId } = await biz();
    const id = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 10000 });
    expect(await sem(workspaceId, id)).toBe("PHYSICAL_ONLY");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 3. legacy row amended after the cutover changing receivables only → stays LEGACY_AMBIGUOUS", async () => {
    const { workspaceId, businessId } = await biz();
    const v1 = await row(workspaceId, businessId, { createdAt: PRE, cashOnHand: 130000 });
    const v2 = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 130000, version: 2, changedFields: ["receivables"] });
    await link(v1, v2);
    expect(await sem(workspaceId, v2)).toBe("LEGACY_AMBIGUOUS");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 3b. same through the REAL amendFinancialSnapshot service (post-cutover now)", async () => {
    const { workspaceId, businessId } = await biz();
    const v1 = await row(workspaceId, businessId, { createdAt: PRE, cashOnHand: 130000 });
    const { snapshot } = await amendFinancialSnapshot(v1, { receivables: 5000, amendmentReason: "add receivables" } as never, actor, workspaceId);
    expect(snapshot!.cashOnHand).toBe(130000); // copied forward under a brand-new createdAt
    expect(await sem(workspaceId, snapshot!.id)).toBe("LEGACY_AMBIGUOUS");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 4. legacy row amended after the cutover explicitly replacing cashOnHand → PHYSICAL_ONLY", async () => {
    const { workspaceId, businessId } = await biz();
    const v1 = await row(workspaceId, businessId, { createdAt: PRE, cashOnHand: 130000 });
    const { snapshot } = await amendFinancialSnapshot(v1, { cashOnHand: 10000, amendmentReason: "cash only" } as never, actor, workspaceId);
    expect(await sem(workspaceId, snapshot!.id)).toBe("PHYSICAL_ONLY");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 5. physical row amended later without changing cash → stays PHYSICAL_ONLY", async () => {
    const { workspaceId, businessId } = await biz();
    const v1 = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 10000 });
    const v2 = await row(workspaceId, businessId, { createdAt: POST2, cashOnHand: 10000, version: 2, changedFields: ["notes"] });
    await link(v1, v2);
    expect(await sem(workspaceId, v2)).toBe("PHYSICAL_ONLY");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 6. legacy → amendment → amendment with no cash changes → LEGACY_AMBIGUOUS throughout", async () => {
    const { workspaceId, businessId } = await biz();
    const v1 = await row(workspaceId, businessId, { createdAt: PRE, cashOnHand: 130000 });
    const v2 = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 130000, version: 2, changedFields: ["receivables"] });
    const v3 = await row(workspaceId, businessId, { createdAt: POST2, cashOnHand: 130000, version: 3, changedFields: ["payables"] });
    await link(v1, v2); await link(v2, v3);
    for (const id of [v1, v2, v3]) expect(await sem(workspaceId, id)).toBe("LEGACY_AMBIGUOUS");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 7. legacy → explicit post-cutover cash replacement → later unrelated amendment → PHYSICAL_ONLY thereafter", async () => {
    const { workspaceId, businessId } = await biz();
    const v1 = await row(workspaceId, businessId, { createdAt: PRE, cashOnHand: 130000 });
    const v2 = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 10000, version: 2, changedFields: ["cashOnHand"] });
    const v3 = await row(workspaceId, businessId, { createdAt: POST2, cashOnHand: 10000, version: 3, changedFields: ["receivables"] });
    await link(v1, v2); await link(v2, v3);
    expect(await sem(workspaceId, v1)).toBe("LEGACY_AMBIGUOUS");
    expect(await sem(workspaceId, v2)).toBe("PHYSICAL_ONLY");
    expect(await sem(workspaceId, v3)).toBe("PHYSICAL_ONLY");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 8. lineage cycle, dangling reference and branch fail closed", async () => {
    const { workspaceId, businessId } = await biz();
    // cycle: v2 ↔ v3
    const a = randomUUID(), b = randomUUID();
    await row(workspaceId, businessId, { id: a, createdAt: POST, cashOnHand: 10000, version: 2, changedFields: ["cashOnHand"], supersededById: null });
    await row(workspaceId, businessId, { id: b, createdAt: POST2, cashOnHand: 20000, version: 3, changedFields: ["cashOnHand"], supersededById: a });
    await link(a, b);
    expect(await sem(workspaceId, a)).toBe("LEGACY_AMBIGUOUS");
    expect(await sem(workspaceId, b)).toBe("LEGACY_AMBIGUOUS");
    // dangling: version 2 whose predecessor row does not exist
    const other = { start: "2026-08-01", end: "2026-08-31" };
    const d = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 10000, version: 2, changedFields: ["cashOnHand"], period: other });
    expect(await sem(workspaceId, d)).toBe("LEGACY_AMBIGUOUS");
    // branch: two predecessors point at the same successor
    const br = { start: "2026-07-01", end: "2026-07-31" };
    const root1 = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 10000, period: br });
    const succ = await row(workspaceId, businessId, { createdAt: POST2, cashOnHand: 10000, version: 3, changedFields: ["notes"], period: br });
    const root2 = await row(workspaceId, businessId, { createdAt: POST, cashOnHand: 10000, version: 2, period: br });
    await link(root1, succ); await link(root2, succ);
    expect(await sem(workspaceId, succ)).toBe("LEGACY_AMBIGUOUS");
    // and a bank on top of a fail-closed row is never added
    await seedKnownBank(workspaceId, businessId, 120000, { start: "2026-09-01", end: "2026-09-30" });
    const r = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id: a } });
    const input = await loadFinanceEngineInput(r, workspaceId);
    expect(input.cashSemantics).toBe("LEGACY_AMBIGUOUS");
    expect(resolveLiquidity(input).totalLiquidFunds).toBe(10000);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] 9. workspace A cannot influence semantics resolution for workspace B", async () => {
    const A = await biz();
    const B = await biz();
    // Workspace A holds a legacy root and an explicit post-cutover replacement for the SAME period.
    const a1 = await row(A.workspaceId, A.businessId, { createdAt: PRE, cashOnHand: 130000 });
    const a2 = await row(A.workspaceId, A.businessId, { createdAt: POST, cashOnHand: 10000, version: 2, changedFields: ["cashOnHand"] });
    await link(a1, a2);
    // Workspace B has an original legacy row for the same period dates.
    const b1 = await row(B.workspaceId, B.businessId, { createdAt: PRE, cashOnHand: 130000 });
    expect(await sem(A.workspaceId, a2)).toBe("PHYSICAL_ONLY");
    expect(await sem(B.workspaceId, b1)).toBe("LEGACY_AMBIGUOUS");
    // Asking with the wrong workspace never reads or trusts another tenant's lineage.
    const rowA = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id: a2 } });
    expect(await resolveFinancialSnapshotCashSemantics(rowA, B.workspaceId)).toBe("LEGACY_AMBIGUOUS");
    await teardownOwnerBusiness(A.businessId); await teardownOwnerBusiness(B.businessId);
  });

  it("[db] 10. legacy ambiguous value + bank balance is never double-counted, through the real diagnosis", async () => {
    const { workspaceId, businessId } = await biz();
    // Legacy combined cash+bank value of 130000 on a loss-making business (30000/month loss).
    const v1 = await row(workspaceId, businessId, { createdAt: PRE, cashOnHand: 130000 });
    await seedKnownBank(workspaceId, businessId, 120000, PERIOD);
    const { snapshot } = await amendFinancialSnapshot(v1, { receivables: 5000, amendmentReason: "unrelated" } as never, actor, workspaceId);
    const row2 = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id: snapshot!.id } });
    const input = await loadFinanceEngineInput(row2, workspaceId);
    expect(input.bankBalance).toBe(120000); // the bank is available…
    expect(resolveLiquidity(input).totalLiquidFunds).toBe(130000); // …but not added on top of the combined value
    const d = await runFinanceDiagnosis(businessId, snapshot!.id, actor, workspaceId);
    expect(d.findings.map((f: { code: string }) => f.code)).not.toContain("FIN_LIQUIDITY_UNCONFIRMED");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] a snapshot created through createFinancialSnapshot now is PHYSICAL_ONLY and adds its bank", async () => {
    const { workspaceId, businessId } = await biz();
    const s = await createFinancialSnapshot(businessId, { periodStart: PERIOD.start, periodEnd: PERIOD.end, currency: "INR", revenue: 100000, fixedCosts: 130000, cashOnHand: 10000 }, actor, workspaceId);
    await seedKnownBank(workspaceId, businessId, 120000, PERIOD);
    const r = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { id: s.id } });
    const input = await loadFinanceEngineInput(r, workspaceId);
    expect(input.cashSemantics).toBe("PHYSICAL_ONLY");
    expect(resolveLiquidity(input).totalLiquidFunds).toBe(130000);
    await teardownOwnerBusiness(businessId);
  });
});
