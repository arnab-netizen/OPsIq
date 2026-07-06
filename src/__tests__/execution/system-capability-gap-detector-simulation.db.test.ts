/**
 * OpsIQ Capability Gap Detector — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): repeated quality complaints/rework drive a recurring-complaint owner
 * burden. getOwnerNowView must turn the gaps OpsIQ keeps hitting into governed system feature
 * recommendations (capabilityGaps): each a RECOMMENDED capability (never auto-built), with a governance
 * guardrail that keeps material decisions owner-controlled, backed by real evidence, and with no fabricated
 * money or disciplinary language. A clean workspace has no capability gap. Requires TEST_WITH_DB=true.
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
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/i;
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|discipline|disciplinary|punish)\b/i;

const CAP_TYPES = new Set([
  "VERIFIED_FINANCIAL_LEDGER", "REFUND_RECONCILIATION", "MARGIN_SIMULATION", "SPEND_CONTROL_LEDGER",
  "COMPENSATION_INTEGRATION", "CONTRACT_TERMS_REGISTRY", "LEGAL_REVIEW_WORKFLOW", "IDENTITY_EVIDENCE_CHAIN",
  "AUTOMATED_PROOF_CAPTURE", "REAL_TIME_KPI_FEED", "SUPPLIER_INVENTORY_INTEGRATION", "CUSTOMER_FEEDBACK_INTAKE",
  "AUTOMATED_ROLLBACK", "DEMAND_VALIDATION",
]);

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

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] OpsIQ Capability Gap Detector (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `cgd-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `cgd-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    await acceptedProof(p1, 8);
    await acceptedProof(p2, 7);
    await acceptedProof(p3, 6);
    await opEvent("COMPLAINT", "quality", p1, 5, "HIGH");
    await opEvent("COMPLAINT", "quality", p2, 4);
    await opEvent("REWORK", "quality", p1, 5);
    await opEvent("REWORK", "quality", p2, 4);
    await opEvent("REWORK", "quality", p3, 3);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.operationalEvent.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff] } } });
  });

  it("recommends governed system capabilities to close real gaps; material stays owner-controlled", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const cg = out.capabilityGaps;
    expect(cg).not.toBeNull();
    expect(cg!.recommendations.length).toBeGreaterThan(0);
    expect(cg!.topRecommendation).not.toBeNull();

    for (const r of cg!.recommendations) {
      expect(CAP_TYPES.has(r.capabilityType)).toBe(true);
      expect(r.workspaceId).toBe(wsL);
      expect(r.status).toBe("RECOMMENDED"); // never auto-built
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(r.estimatedComplexity);
      expect(r.problemStatement.length).toBeGreaterThan(10);
      expect(r.recommendedCapability.length).toBeGreaterThan(10);
      expect(r.governanceGuardrail.length).toBeGreaterThan(20);
    }
    // The recurring-complaint burden implies a structured customer-feedback intake.
    expect(cg!.recommendations.some((r) => r.capabilityType === "CUSTOMER_FEEDBACK_INTAKE")).toBe(true);
    // Summary counts sum to the number of recommendations.
    expect(cg!.summary.total).toBe(cg!.recommendations.length);

    // No fraud/negligence/HR-discipline language, no fabricated money figure, no hidden score.
    const json = JSON.stringify(cg).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("a clean workspace has no capability gap and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const cg = out.capabilityGaps;
    if (cg) expect(cg.recommendations).toHaveLength(0);
    expect(JSON.stringify(cg)).not.toContain(p1);
  });
});
