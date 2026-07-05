/**
 * Process Intelligence v1 → top process breakdown — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): jobs pass through proof/review; a manager leaves escalations
 * unacknowledged; repeated quality complaints + rework land on accepted proof. getOwnerNowView must
 * surface a single top process breakdown over the trusted chain, linked to real evidence (proof /
 * operational-event / escalation ids), a profit-leak / constraint / SLO, and a specific correction —
 * with no fabricated financial impact, no fraud/negligence label, and no hidden score. A clean
 * workspace fabricates nothing; workspace isolation holds. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const mgr = randomUUID();
const staff = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy)\b/i;

const acceptedProof = async (id: string, ago: number) => {
  await db.proof.create({ data: {
    id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: staff, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    submittedAt: new Date(NOW - (ago + 1) * H), createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
};
const opEvent = async (eventType: string, category: string, proofId: string, ago: number, severity = "MEDIUM") => {
  await db.operationalEvent.create({ data: {
    id: randomUUID(), workspaceId: wsL, businessId: bizL, eventType, category, severity, status: "OPEN",
    source: "customer_reported", description: `${category} ${eventType}`, relatedProofId: proofId,
    occurredAt: new Date(NOW - ago * H), createdAt: new Date(NOW - ago * H), updatedAt: new Date(NOW - ago * H),
  } });
};
const ignoredEscalation = async (id: string) => {
  await db.escalation.create({ data: {
    id, workspaceId: wsL, category: "customer_complaint", severity: "HIGH", assignedTarget: mgr,
    status: "OPEN", dueAt: new Date(NOW - 6 * H), createdAt: new Date(NOW - 7 * H),
  } });
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Process Intelligence v1 (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();
  const esc1 = randomUUID(), esc2 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `pi-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `pi-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    await acceptedProof(p1, 8);
    await acceptedProof(p2, 7);
    await acceptedProof(p3, 6);
    // Repeated quality complaints + rework on accepted work → QUALITY_FAILURE_LOOP / REWORK_LOOP.
    await opEvent("COMPLAINT", "quality", p1, 5, "HIGH");
    await opEvent("COMPLAINT", "quality", p2, 4);
    await opEvent("REWORK", "quality", p1, 5);
    await opEvent("REWORK", "quality", p2, 4);
    await opEvent("REWORK", "quality", p3, 3);
    // A manager ignoring escalations → ESCALATION_RESPONSE_BREAKDOWN.
    await ignoredEscalation(esc1);
    await ignoredEscalation(esc2);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.escalation.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("surfaces a single top process breakdown from the trusted chain, with evidence + a specific correction", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const pi = out.processIntelligence;
    expect(pi).not.toBeNull();
    expect(pi!.topFinding).not.toBeNull();
    const top = pi!.topFinding!;
    // A real process failure (not DATA_INSUFFICIENT), one of the high-value types.
    expect(["REWORK_LOOP", "QUALITY_FAILURE_LOOP", "ESCALATION_RESPONSE_BREAKDOWN"]).toContain(top.findingType);
    expect(top.recommendedCorrectiveAction.length).toBeGreaterThan(10);
    expect(top.relatedSLO).toBeTruthy();
    expect(["OWNER", "MANAGER", "STAFF"]).toContain(top.requiredApprovalLevel);
    // Evidence is real: at least one finding links operational-event ids or escalation ids.
    const linked = pi!.findings.some((f) => f.supportingOperationalEventIds.length > 0 || f.supportingEscalationIds.length > 0);
    expect(linked).toBe(true);
    // The escalation breakdown is present with the manager + escalation ids.
    const esc = pi!.findings.find((f) => f.findingType === "ESCALATION_RESPONSE_BREAKDOWN");
    if (esc) {
      expect(esc.affectedManagerId).toBe(mgr);
      expect(esc.supportingEscalationIds.sort()).toEqual([esc1, esc2].sort());
    }
    // No fabricated financial impact; no fraud label; no hidden score.
    expect(JSON.stringify(pi)).not.toMatch(NO_FRAUD);
    expect(JSON.stringify(pi)).not.toMatch(/score/i);
    expect(JSON.stringify(pi)).not.toMatch(/"expectedImpact":\s*\d/);
  });

  it("a clean workspace returns DATA_INSUFFICIENT and no cross-workspace bleed", async () => {
    const out = await getOwnerNowView(wsClean);
    const pi = out.processIntelligence;
    expect(pi).not.toBeNull();
    expect(pi!.topFinding?.findingType).toBe("DATA_INSUFFICIENT");
    // None of wsL's evidence ids leaked into the clean workspace's findings.
    expect(JSON.stringify(pi)).not.toContain(esc1);
    expect(JSON.stringify(pi)).not.toContain(p1);
  });
});
