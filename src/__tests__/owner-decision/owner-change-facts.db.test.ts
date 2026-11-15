/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows and seeded snapshot inputs are untyped */
/**
 * P2 — "what changed" from persisted mutation facts, through the real services on real Postgres:
 *   - same issue + NEW evidence + still raised → EVIDENCE_UPDATED, never "resolved";
 *   - attributable → unattributable (a second business added) → ATTRIBUTION_CHANGED, never resolved;
 *   - re-attribution (the other business archived) → ATTRIBUTION_CHANGED, never a new critical issue;
 *   - a compliance breach recorded, then cleared in its own record → appeared, then "closed in its record".
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/owner-change-facts.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness, updateBusiness } from "@/services/founder-recovery/business.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { createBusinessRisk as createBusinessRiskInService, reviewRisk } from "@/services/owner-mode/business-risk.service";
import { recordComplianceItem, updateComplianceStatus } from "@/services/owner-mode/compliance.service";
import { getOwnerHome } from "@/services/owner-home/home.service";

/**
 * A critical risk's alert is raised in the risk's own transaction (Round 9), and an alert belongs to a real
 * workspace: the risk's workspace row is ensured first (production risks always have one).
 */
async function createBusinessRisk(input: Parameters<typeof createBusinessRiskInService>[0]) {
  await db.workspace.upsert({
    where: { id: input.workspaceId },
    update: {},
    create: { id: input.workspaceId, name: "Risk QA", slug: `risk-qa-${input.workspaceId}`, isActive: true, updatedAt: new Date() },
  });
  return createBusinessRiskInService(input);
}


const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `facts-${actor}@example.com`, name: "Change facts QA", isActive: true, updatedAt: new Date() },
  });
});

function period(daysAgoEnd: number) {
  const end = new Date(Date.now() - daysAgoEnd * 86_400_000);
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

const BAD_SALES = {
  currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000,
  newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2,
};

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}

const kinds = (d: any) => d.whatChanged.map((c: any) => c.kind) as string[];

describe("[db] P2 — change detection by issue + evidence + attribution", () => {
  it("[db] same issue + NEW evidence that still raises it → EVIDENCE_UPDATED, never resolved", async () => {
    const workspaceId = randomUUID();
    const businessId = await business(workspaceId, "QA Facts Evidence");
    const s1 = await createSalesSnapshot(businessId, { ...period(20), ...BAD_SALES } as any, actor, workspaceId);
    const c1 = await runSalesDiagnosis(businessId, s1.id, actor, workspaceId);
    const s2 = await createSalesSnapshot(businessId, { ...period(0), ...BAD_SALES } as any, actor, workspaceId);
    const c2 = await runSalesDiagnosis(businessId, s2.id, actor, workspaceId);
    const codes1 = new Set(c1.findings.map((f: any) => f.code));
    expect(c2.findings.every((f: any) => codes1.has(f.code))).toBe(true); // the same issues, re-raised by newer figures

    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(d.whatChanged).toContainEqual({ kind: "EVIDENCE_UPDATED", message: "New Sales figures were analysed." });
    expect(kinds(d)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    expect(kinds(d)).not.toContain("CRITICAL_ISSUE_APPEARED");
    await teardownOwnerBusiness(businessId);
  });

  it("[db] attribution loss and re-attribution are ATTRIBUTION_CHANGED — never resolved, never a new critical issue", async () => {
    const workspaceId = randomUUID();
    const a = await business(workspaceId, "QA Facts A");
    const snap = await createSalesSnapshot(a, { ...period(0), ...BAD_SALES } as any, actor, workspaceId);
    await runSalesDiagnosis(a, snap.id, actor, workspaceId);
    await createBusinessRisk({
      workspaceId, actorId: actor, riskCode: `R-${randomUUID().slice(0, 8)}`, title: "Main customer may leave", category: "FINANCIAL" as any,
      likelihood: 90, impact: 90,
    });

    const single = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    expect(single.whatChanged).toContainEqual({ kind: "CRITICAL_ISSUE_APPEARED", message: 'New critical issue recorded: "Main customer may leave".' });
    const appearedBefore = kinds(single).filter((k) => k === "CRITICAL_ISSUE_APPEARED").length;

    // A second real business: the workspace risk can no longer be attributed to A.
    const b = await business(workspaceId, "QA Facts B");
    const lost = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    const lostChange = lost.whatChanged.find((c: any) => c.kind === "ATTRIBUTION_CHANGED");
    expect(lostChange?.message).toMatch(/can no longer attribute workspace-wide risks and compliance items specifically to this business/);
    expect(kinds(lost)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    expect(lost.attention.some((t: any) => t.source === "business_risk")).toBe(false);

    // B archived: attributable again — reported as attribution, not as a new critical issue.
    await updateBusiness(b, { isActive: false } as any, actor, workspaceId); // audited archival
    const regained = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    expect(regained.whatChanged.find((c: any) => c.kind === "ATTRIBUTION_CHANGED")?.message).toMatch(/attributes workspace-wide risks and compliance items to it again/);
    expect(kinds(regained).filter((k) => k === "CRITICAL_ISSUE_APPEARED").length).toBe(appearedBefore);
    expect(kinds(regained)).not.toContain("CRITICAL_ISSUE_RESOLVED");

    await db.businessRiskEntry.deleteMany({ where: { workspaceId } });
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });

  it("[db] a compliance breach recorded then cleared is reported from its own record (the cleared item raises nothing now)", async () => {
    const workspaceId = randomUUID();
    // Recording a breach raises a critical alert, whose table references a real workspace row.
    await db.workspace.create({ data: { id: workspaceId, name: "Facts QA", slug: `facts-qa-${workspaceId}`, isActive: true, updatedAt: new Date() } });
    const businessId = await business(workspaceId, "QA Facts Compliance");
    const itemId = await recordComplianceItem({ workspaceId, businessId, actorId: actor, kind: "licence", name: "Trade licence" });
    await updateComplianceStatus({ workspaceId, itemId, actorId: actor, newStatus: "breached" as any });
    const breached = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(breached.whatChanged).toContainEqual({ kind: "CRITICAL_ISSUE_APPEARED", message: 'New critical issue recorded: "Trade licence".' });
    expect(breached.primaryTarget?.source).toBe("compliance_item");
    // The service's own lifecycle: a breach is cleared back to an in-force (active, unexpired) obligation.
    await updateComplianceStatus({ workspaceId, itemId, actorId: actor, newStatus: "active" as any });
    const closed = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(closed.whatChanged).toContainEqual({ kind: "CRITICAL_ISSUE_RESOLVED", message: '"Trade licence" was closed in its record.' });
    expect(closed.attention.some((t: any) => t.source === "compliance_item")).toBe(false);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] a back-filled OLDER period diagnosed after a newer one is history: the newer period stays current and nothing is claimed resolved", async () => {
    const workspaceId = randomUUID();
    const businessId = await business(workspaceId, "QA Facts Backfill");
    const recent = await createSalesSnapshot(businessId, { ...period(0), ...BAD_SALES } as any, actor, workspaceId);
    await runSalesDiagnosis(businessId, recent.id, actor, workspaceId);
    const GOOD = { ...BAD_SALES, orders: 90, complaints: 0, lostCustomers: 0, repeatCustomers: 60, discountAmount: 0, refundAmount: 0, revenue: 900000 };
    const older = await createSalesSnapshot(businessId, { ...period(60), ...GOOD } as any, actor, workspaceId);
    await runSalesDiagnosis(businessId, older.id, actor, workspaceId); // back-filled history, diagnosed last
    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    // The good back-filled period never "resolves" the newer period's issues (it is not the current reading).
    expect(kinds(d)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    expect(d.whatChanged.some((c: any) => /no longer shown by the new figures/.test(c.message))).toBe(false);
    // The newer period is the current Sales diagnosis (its issues are still the ones on the decision).
    const current = await db.ownerSalesCycle.findFirst({ where: { businessId }, orderBy: [{ snapshot: { periodEnd: "desc" } }], select: { snapshotId: true } });
    expect(current?.snapshotId).toBe(recent.id);
    expect(d.attention.some((t: any) => t.domain === "sales")).toBe(true);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] a breach cleared to 'active' on an EXPIRED obligation is not reported closed (it is still a hard stop)", async () => {
    const workspaceId = randomUUID();
    await db.workspace.create({ data: { id: workspaceId, name: "Facts QA", slug: `facts-qa-${workspaceId}`, isActive: true, updatedAt: new Date() } });
    const businessId = await business(workspaceId, "QA Facts Expired");
    const itemId = await recordComplianceItem({ workspaceId, businessId, actorId: actor, kind: "licence", name: "Fire certificate", expiresAt: new Date(Date.now() - 5 * 86_400_000) });
    await updateComplianceStatus({ workspaceId, itemId, actorId: actor, newStatus: "breached" as any });
    await updateComplianceStatus({ workspaceId, itemId, actorId: actor, newStatus: "active" as any });
    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(d.primaryTarget?.source).toBe("compliance_item");
    expect(d.whatChanged).not.toContainEqual({ kind: "CRITICAL_ISSUE_RESOLVED", message: '"Fire certificate" was closed in its record.' });
    await teardownOwnerBusiness(businessId);
  });

  it("[db] a critical risk resolved and then REOPENED is not reported as closed", async () => {
    const workspaceId = randomUUID();
    const a = await business(workspaceId, "QA Facts Reopen");
    const snap = await createSalesSnapshot(a, { ...period(0), ...BAD_SALES } as any, actor, workspaceId);
    await runSalesDiagnosis(a, snap.id, actor, workspaceId);
    const risk = await createBusinessRisk({
      workspaceId, actorId: actor, riskCode: `R-${randomUUID().slice(0, 8)}`, title: "Key supplier may fail", category: "OPERATIONAL" as any, likelihood: 90, impact: 90,
    });
    const riskId = (risk as any).id as string;
    await reviewRisk({ workspaceId, riskId, actorId: actor, newStatus: "MITIGATING" });
    await reviewRisk({ workspaceId, riskId, actorId: actor, newStatus: "RESOLVED" });
    const closed = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    expect(closed.whatChanged).toContainEqual({ kind: "CRITICAL_ISSUE_RESOLVED", message: '"Key supplier may fail" was closed in its record.' });
    await reviewRisk({ workspaceId, riskId, actorId: actor, newStatus: "IDENTIFIED" as any });
    const reopened = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    expect(reopened.whatChanged).not.toContainEqual({ kind: "CRITICAL_ISSUE_RESOLVED", message: '"Key supplier may fail" was closed in its record.' });
    await db.businessRiskEntry.deleteMany({ where: { workspaceId } });
    await teardownOwnerBusiness(a);
  });
});
