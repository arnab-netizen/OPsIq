/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, seeded snapshot inputs and service payloads are untyped */
/**
 * Round-4 causal regressions, through the real services on real Postgres:
 *   A-P1-1  a back-filled OLDER period diagnosed after a newer one never becomes the current reading
 *           (a critical cash-survival issue raised by the newer period stays the main target);
 *   A-P2-1  "what changed" compares against the next-latest EVIDENCE, never a back-filled run;
 *   A-P2-2  a breach moved to "evidence pending" is remediation, not "closed in its record";
 *   A-P2-3  a repeated (no-op) archive request is never read as an archival (no false "regained");
 *   F-P2-2  a critical risk mitigated below critical / accepted through the review workflow is reported
 *           (accepted as accepted — never as resolved);
 *   D-P1-1  Now View never passes its growth gate on an amended (not yet re-diagnosed) Finance reading.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r4-causal-regressions.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness, updateBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createBusinessRisk, reviewRisk } from "@/services/owner-mode/business-risk.service";
import { recordComplianceItem, updateComplianceStatus } from "@/services/owner-mode/compliance.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `r4-${actor}@example.com`, name: "R4 QA", isActive: true, updatedAt: new Date() },
  });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** A period ending `endDaysAgo` days ago, `length` days long. */
function period(endDaysAgo: number, length = 29) {
  const end = new Date(Date.now() - endDaysAgo * 86_400_000);
  return { periodStart: iso(new Date(end.getTime() - length * 86_400_000)), periodEnd: iso(end) };
}

const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };
const SAFE = { cashInHand: 5_000_000, dailyCollections: 50000, receivables: 1000, receivablesOverdue: 0, payables: 1000, upcomingEmi: 0, rentDue: 1000, salaryDue: 1000, vendorDue: 0, taxDue: 0, ownerWithdrawal: 0 };

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}

async function cashCycle(workspaceId: string, businessId: string, p: { periodStart: string; periodEnd: string }, figures: typeof SAFE) {
  const snap = await createCashflowSnapshot(businessId, { ...p, currency: "INR", ...figures }, actor, workspaceId);
  return runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
}

const kinds = (d: any) => d.whatChanged.map((c: any) => c.kind) as string[];

describe("[db] round-4 causal regressions", () => {
  it("[db] A-P1-1 — a back-filled OLDER period diagnosed last never becomes current: the newer period's critical cash issue stays", async () => {
    const workspaceId = randomUUID();
    const b = await business(workspaceId, "QA R4 Backfill");
    const recent = await cashCycle(workspaceId, b, period(2), UNSAFE);
    expect(["CRITICAL", "INSOLVENT_RISK"]).toContain(recent.cashflowState);
    const before = (await getOwnerHome(workspaceId, b)).currentOwnerDecision!;
    expect(before.primaryTarget?.domain).toBe("cashflow");
    // A shorter, OLDER, safe period is diagnosed AFTER (it takes the highest sequence number).
    const backfill = await cashCycle(workspaceId, b, period(10, 10), SAFE);
    expect(backfill.sequenceNumber).toBeGreaterThan(recent.sequenceNumber);
    const after = (await getOwnerHome(workspaceId, b)).currentOwnerDecision!;
    expect(after.primaryTarget?.domain).toBe("cashflow");
    expect(after.primaryTarget?.title).toBe(before.primaryTarget?.title);
    expect(kinds(after)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    await teardownOwnerBusiness(b);
  });

  it("[db] A-P2-1 — the 'what changed' baseline is the next-latest evidence, never a back-filled run (no false 'new critical issue')", async () => {
    const workspaceId = randomUUID();
    const b = await business(workspaceId, "QA R4 Baseline");
    await cashCycle(workspaceId, b, period(35), UNSAFE); // earlier period: critical
    await cashCycle(workspaceId, b, period(90), SAFE); // back-filled older period: clean
    await cashCycle(workspaceId, b, period(2), UNSAFE); // newest period: still critical
    const d = (await getOwnerHome(workspaceId, b)).currentOwnerDecision!;
    expect(d.whatChanged.some((c: any) => c.kind === "CRITICAL_ISSUE_APPEARED" && /Cash flow figures/.test(c.message))).toBe(false);
    expect(d.whatChanged).toContainEqual({ kind: "EVIDENCE_UPDATED", message: "New Cash flow figures were analysed." });
    await teardownOwnerBusiness(b);
  });

  it("[db] A-P2-2 — a breach moved to 'evidence pending' is not reported closed", async () => {
    const workspaceId = randomUUID();
    await db.workspace.create({ data: { id: workspaceId, name: "R4 QA", slug: `r4-qa-${workspaceId}`, isActive: true, updatedAt: new Date() } });
    const b = await business(workspaceId, "QA R4 Compliance");
    const itemId = await recordComplianceItem({ workspaceId, businessId: b, actorId: actor, kind: "licence", name: "Food licence" });
    await updateComplianceStatus({ workspaceId, itemId, actorId: actor, newStatus: "breached" as any });
    await updateComplianceStatus({ workspaceId, itemId, actorId: actor, newStatus: "evidence_pending" as any });
    const d = (await getOwnerHome(workspaceId, b)).currentOwnerDecision!;
    expect(d.whatChanged).not.toContainEqual({ kind: "CRITICAL_ISSUE_RESOLVED", message: '"Food licence" was closed in its record.' });
    await teardownOwnerBusiness(b);
  });

  it("[db] A-P2-3 — a repeated archive request on an already-archived business is not an archival (no false 'attributable again')", async () => {
    const workspaceId = randomUUID();
    const a = await business(workspaceId, "QA R4 A");
    await cashCycle(workspaceId, a, period(2), UNSAFE);
    await createBusinessRisk({ workspaceId, actorId: actor, riskCode: `R-${randomUUID().slice(0, 8)}`, title: "Landlord may not renew", category: "OPERATIONAL" as any, likelihood: 90, impact: 90 });
    const bId = await business(workspaceId, "QA R4 B");
    // B archived earlier without an audited transition in this window (legacy), then a no-op request repeats it.
    await db.ownerBusiness.update({ where: { id: bId }, data: { isActive: false } });
    await updateBusiness(bId, { isActive: false } as any, actor, workspaceId);
    const noop = await db.auditEvent.findFirst({ where: { workspaceId, entityId: bId, eventName: "owner.business_updated" }, orderBy: { occurredAt: "desc" } });
    expect((noop?.payload as any)?.isActiveChange).toBeUndefined();
    const d = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    expect(d.whatChanged.find((c: any) => c.kind === "ATTRIBUTION_CHANGED")?.message ?? "").not.toMatch(/attributes workspace-wide risks and compliance items to it again/);
    await db.businessRiskEntry.deleteMany({ where: { workspaceId } });
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(bId);
  });

  it("[db] F-P2-2 — a critical risk reviewed to MITIGATING below critical is reported; ACCEPTED is reported as accepted, never resolved", async () => {
    const workspaceId = randomUUID();
    const a = await business(workspaceId, "QA R4 Risk");
    await cashCycle(workspaceId, a, period(2), SAFE);
    const mitigated = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: `R-${randomUUID().slice(0, 8)}`, title: "Key cook may leave", category: "OPERATIONAL" as any, likelihood: 90, impact: 90 });
    await reviewRisk({ workspaceId, riskId: (mitigated as any).id, actorId: actor, newStatus: "MITIGATING", residualRisk: 40 } as any);
    const accepted = await createBusinessRisk({ workspaceId, actorId: actor, riskCode: `R-${randomUUID().slice(0, 8)}`, title: "Road works outside", category: "OPERATIONAL" as any, likelihood: 90, impact: 90 });
    await reviewRisk({ workspaceId, riskId: (accepted as any).id, actorId: actor, newStatus: "ACCEPTED", acceptanceRationale: "Temporary; council schedule known" } as any);
    const d = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    expect(d.whatChanged).toContainEqual({ kind: "SEVERITY_DECREASED", message: '"Key cook may leave" is no longer rated critical; its record is still open.' });
    expect(d.whatChanged).toContainEqual({ kind: "RISK_ACCEPTED", message: '"Road works outside" was accepted as a known risk in its record; it is not resolved.' });
    expect(d.whatChanged).not.toContainEqual({ kind: "CRITICAL_ISSUE_RESOLVED", message: '"Road works outside" was closed in its record.' });
    await db.businessRiskEntry.deleteMany({ where: { workspaceId } });
    await teardownOwnerBusiness(a);
  });

  it("[db] D-P1-1 — Now View never passes its growth gate on an amended (not yet re-diagnosed) Finance reading, and asks for the re-diagnosis", async () => {
    const workspaceId = randomUUID();
    const b = await business(workspaceId, "QA R4 Amended");
    await cashCycle(workspaceId, b, period(2), SAFE);
    const fin = await createFinancialSnapshot(b, { ...period(2), currency: "INR", revenue: 900000, costOfGoods: 300000, fixedCosts: 100000, variableCosts: 100000, cashOnHand: 5_000_000 } as any, actor, workspaceId);
    await runFinanceDiagnosis(b, fin.id, actor, workspaceId);
    await amendFinancialSnapshot(fin.id, { amendmentReason: "COGS was understated", costOfGoodsOrServices: 950000 } as any, actor, workspaceId);
    const payload: any = await getOwnerNowView(workspaceId, b);
    expect(payload.view.growthReadinessStatus).not.toBe("OK");
    expect(payload.view.missingDataRequests).toContain("a Finance diagnosis of your amended figures (re-run the Finance diagnosis)");
    await teardownOwnerBusiness(b);
  });
});
