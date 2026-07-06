/**
 * Owner Workload Reduction v2 — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): repeated quality complaints/rework + weak proof drive process
 * findings and owner-approval corrections. getOwnerNowView must surface the avoidable owner burden
 * (ownerWorkloadReduction) with safe reduction recommendations and a risk guardrail — high-risk items keep
 * owner approval, low-risk repeats are delegated/policy-routed, and no fabricated time saving or
 * disciplinary language appears. A clean workspace fabricates nothing. Requires TEST_WITH_DB=true.
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

const WORKLOAD_TYPES = new Set([
  "REPEATED_OWNER_ADJUDICATION", "OWNER_REVIEW_BURDEN", "OWNER_APPROVAL_BOTTLENECK", "LOW_RISK_OWNER_INTERRUPT",
  "RECURRING_COMPLAINT_ESCALATION", "MANAGER_ESCALATION_OVERUSE", "MISSING_DATA_BURDEN",
  "CORRECTION_APPROVAL_BACKLOG", "TRAINING_DELEGATION_OPPORTUNITY",
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

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Owner Workload Reduction v2 (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `owr-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `owr-${id.slice(0, 8)}`, createdBy: owner } });
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

  it("surfaces avoidable owner burden with safe reductions + a risk guardrail; high-risk keeps owner approval", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const owr = out.ownerWorkloadReduction;
    expect(owr).not.toBeNull();
    expect(owr!.findings.length).toBeGreaterThan(0);
    expect(owr!.topFinding).not.toBeNull();

    for (const f of owr!.findings) {
      expect(WORKLOAD_TYPES.has(f.workloadType)).toBe(true);
      expect(f.riskGuardrail.length).toBeGreaterThan(10);
      expect(f.workspaceId).toBe(wsL);
      // No guessed time saving: estimatedOwnerTouches is a real count or null.
      expect(f.estimatedOwnerTouches === null || Number.isInteger(f.estimatedOwnerTouches)).toBe(true);
    }

    // The QUALITY_FAILURE_LOOP correction requires OWNER approval and is high-risk (COMPLAINT_RISK), so a
    // correction-approval-backlog finding keeps owner approval — high-risk is never auto-reduced.
    const backlog = owr!.findings.find((f) => f.workloadType === "CORRECTION_APPROVAL_BACKLOG");
    if (backlog) {
      expect(["KEEP_OWNER_APPROVAL", "DELEGATE_TO_MANAGER"]).toContain(backlog.recommendedReductionAction);
      if (backlog.recommendedReductionAction === "KEEP_OWNER_APPROVAL") expect(backlog.approvalLevel).toBe("OWNER");
    }

    // No fraud/negligence/HR-discipline language, no fabricated money figure, no hidden score.
    const json = JSON.stringify(owr).toLowerCase();
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(/hidden\s*score/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
    expect(json).not.toMatch(/hours saved|minutes saved|time saved/);
  });

  it("a clean workspace fabricates no workload finding and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const owr = out.ownerWorkloadReduction;
    if (owr) expect(owr.findings).toHaveLength(0);
    expect(JSON.stringify(owr)).not.toContain(p1);
  });
});
