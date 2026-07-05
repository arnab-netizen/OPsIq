/**
 * Staff Training Assignment Engine — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): accepted jobs draw repeated quality complaints + rework. Process
 * Intelligence surfaces the breakdown, correction routing + the SOP engine propose checklist/proof
 * changes, and the training assignment engine must propose governed, evidence-backed training/review
 * (trainingAssignments) — coaching only, linked to real evidence, with a required approval + success
 * metric, and never auto-assigned. A clean workspace fabricates only a NEEDS_DATA briefing and leaks no
 * evidence. No firing/payroll/discipline anywhere. Requires TEST_WITH_DB=true.
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
const NO_HR = /\b(fire|fired|firing|terminate|termination|payroll|salary|docking|suspend|written up|write-up|discipline|disciplinary|punish)\b/i;

const TRAINING_TYPES = new Set([
  "PROOF_QUALITY_REVIEW", "PROCESS_STEP_RETRAINING", "MANAGER_REVIEW_QUALITY", "ESCALATION_RESPONSE_REVIEW",
  "DELIVERY_HANDOFF_REVIEW", "CHECKLIST_CHANGE_BRIEFING", "DATA_COLLECTION_BRIEFING",
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

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Staff Training Assignment Engine (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `train-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `train-${id.slice(0, 8)}`, createdBy: owner } });
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

  it("proposes governed, evidence-backed training/review — coaching only, never auto-assigned", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const ta = out.trainingAssignments;
    expect(ta).not.toBeNull();
    expect(ta!.assignments.length).toBeGreaterThan(0);
    expect(ta!.topAssignment).not.toBeNull();

    for (const a of ta!.assignments) {
      expect(TRAINING_TYPES.has(a.trainingType)).toBe(true);
      // Never auto-assigned/auto-completed.
      expect(["PROPOSED", "NEEDS_DATA"]).toContain(a.status);
      expect(a.assignedByRole).toBe("system-proposed");
      expect(["OWNER", "MANAGER", "STAFF"]).toContain(a.approvalLevel);
      expect(a.successMetric.length).toBeGreaterThan(5);
      expect(a.workspaceId).toBe(wsL);
      expect(a.sourceProcessFindingKey.startsWith(`${wsL}:`)).toBe(true);
    }

    // A real (non-NEEDS_DATA) training recommendation was produced from the quality breakdown.
    expect(ta!.assignments.some((a) => a.status === "PROPOSED")).toBe(true);
    // Real evidence flows through.
    expect(ta!.assignments.some((a) => a.supportingOperationalEventIds.length > 0 || a.supportingProofIds.length > 0)).toBe(true);

    // No firing/payroll/discipline, no fraud/negligence, no hidden score, no fabricated amount.
    const json = JSON.stringify(ta);
    expect(json).not.toMatch(NO_HR);
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(/hidden\s*score/i);
    expect(json).not.toMatch(/[$£€]\s?\d/);
  });

  it("a clean workspace proposes only a NEEDS_DATA briefing and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const ta = out.trainingAssignments;
    expect(ta).not.toBeNull();
    expect(ta!.assignments.every((a) => a.status === "NEEDS_DATA" && a.assignedToUserId === null)).toBe(true);
    expect(JSON.stringify(ta)).not.toContain(p1);
  });
});
