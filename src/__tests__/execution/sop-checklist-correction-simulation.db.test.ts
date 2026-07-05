/**
 * SOP / Checklist Correction Engine — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): accepted jobs draw repeated quality complaints + rework. Process
 * Intelligence surfaces the breakdown, correction routing proposes UPDATE_CHECKLIST / REQUIRE_FRESH_PROOF,
 * and the SOP/checklist correction engine must turn those into governed DRAFT SOP/checklist changes on the
 * Owner Now View (`sopChecklistCorrections`) — each linked to real evidence, with a required approval,
 * a success metric, and a review cadence, and never auto-approved. A clean workspace fabricates only a
 * NEEDS_DATA draft and leaks no evidence. Requires TEST_WITH_DB=true.
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

const SOP_AREAS = new Set([
  "PRESSING_WASH_CHECKLIST", "ACCEPTANCE_QUALITY_CHECKLIST", "PROOF_REQUIREMENT_CHECKLIST",
  "DELIVERY_HANDOFF_CHECKLIST", "REVIEW_PROCESS_STEP", "DATA_CAPTURE_CHECKLIST", "TRAINING_HANDOFF", "NONE",
]);
const REAL_STATUSES = new Set(["DRAFT", "PROPOSED", "APPROVED", "REJECTED", "NEEDS_DATA"]);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SOP / Checklist Correction Engine (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `sop-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `sop-${id.slice(0, 8)}`, createdBy: owner } });
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

  it("turns the correction into governed draft SOP/checklist changes with evidence, approval, and a success metric", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const sop = out.sopChecklistCorrections;
    expect(sop).not.toBeNull();
    expect(sop!.drafts.length).toBeGreaterThan(0);
    expect(sop!.topDraft).not.toBeNull();

    for (const d of sop!.drafts) {
      expect(SOP_AREAS.has(d.sopArea)).toBe(true);
      expect(REAL_STATUSES.has(d.status)).toBe(true);
      // Never auto-approved.
      expect(d.status).not.toBe("APPROVED");
      expect(["OWNER", "MANAGER", "STAFF"]).toContain(d.approvalLevel);
      expect(d.ownerApprovalRequired).toBe(d.approvalLevel === "OWNER");
      expect(d.successMetric.length).toBeGreaterThan(5);
      expect(d.workspaceId).toBe(wsL);
      expect(d.sourceCorrectionKey.startsWith(`${wsL}:`)).toBe(true);
    }

    // At least one real (non-NEEDS_DATA) checklist/process draft was produced from the quality breakdown.
    const real = sop!.drafts.filter((d) => d.status !== "NEEDS_DATA");
    expect(real.length).toBeGreaterThan(0);
    expect(real.some((d) => ["ACCEPTANCE_QUALITY_CHECKLIST", "PROOF_REQUIREMENT_CHECKLIST", "REVIEW_PROCESS_STEP"].includes(d.sopArea))).toBe(true);

    // Real evidence flows through: at least one draft carries operational-event ids.
    expect(sop!.drafts.some((d) => d.supportingOperationalEventIds.length > 0)).toBe(true);

    // An owner-gated draft exists (QUALITY_FAILURE_LOOP escalation) and approval is not hidden.
    expect(sop!.drafts.some((d) => d.ownerApprovalRequired)).toBe(true);

    // No fabricated financial amount, no fraud/negligence label, no hidden score, no training assignment.
    const json = JSON.stringify(sop);
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(/hidden\s*score/i);
    expect(json).not.toMatch(/"expectedImpact":\s*\d/);
    expect(json).not.toMatch(/[$£€]\s?\d/);
    expect(json).not.toMatch(/assigned to|training complete/i);
  });

  it("a clean workspace produces only a NEEDS_DATA draft and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const sop = out.sopChecklistCorrections;
    expect(sop).not.toBeNull();
    expect(sop!.drafts.every((d) => d.status === "NEEDS_DATA")).toBe(true);
    const json = JSON.stringify(sop);
    expect(json).not.toContain(p1);
  });
});
