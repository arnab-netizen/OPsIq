/**
 * Bottleneck → Correction Routing — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`): accepted jobs draw repeated quality complaints + rework, and a
 * manager leaves escalations unacknowledged. getOwnerNowView must not only surface the top process
 * breakdown (Process Intelligence) but also route it into PROPOSED, trackable correction actions
 * (processCorrections) — each carrying real evidence, a real target (never fabricated), the required
 * approval level, and an explicit owner-approval marker for owner-gated corrections. Nothing is
 * auto-approved. A clean workspace routes only a DATA_INSUFFICIENT correction and leaks no evidence.
 * Requires TEST_WITH_DB=true.
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
const ignoredEscalation = async (id: string) => {
  await db.escalation.create({ data: {
    id, workspaceId: wsL, category: "customer_complaint", severity: "HIGH", assignedTarget: mgr,
    status: "OPEN", dueAt: new Date(NOW - 6 * H), createdAt: new Date(NOW - 7 * H),
  } });
};

const NINE = new Set([
  "REQUIRE_FRESH_PROOF", "UPDATE_CHECKLIST", "REVIEW_PROCESS_STEP", "ASSIGN_TRAINING_REVIEW",
  "ESCALATE_TO_MANAGER", "ESCALATE_TO_OWNER", "RESOLVE_OPERATIONAL_EVENT", "COLLECT_MISSING_DATA",
  "NO_ACTION_DATA_INSUFFICIENT",
]);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Bottleneck → Correction Routing (laundry)", () => {
  const p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID();
  const esc1 = randomUUID(), esc2 = randomUUID();

  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"]] as const) {
      await db.user.create({ data: { id, email: `bcr-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `bcr-${id.slice(0, 8)}`, createdBy: owner } });
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

  it("routes the top breakdown into proposed, trackable corrections with real evidence + approval", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const routing = out.processCorrections;
    expect(routing).not.toBeNull();
    expect(routing!.corrections.length).toBeGreaterThan(0);
    expect(routing!.topCorrection).not.toBeNull();

    // Every routed correction is a valid governed type, PROPOSED, and never auto-approved unless it's the no-op.
    for (const c of routing!.corrections) {
      expect(NINE.has(c.correctionType)).toBe(true);
      expect(c.status).toBe("PROPOSED");
      expect(c.autoExecutable).toBe(c.correctionType === "NO_ACTION_DATA_INSUFFICIENT");
      expect(c.requiresOwnerApproval).toBe(c.requiredApprovalLevel === "OWNER");
      expect(c.workspaceId).toBe(wsL);
      expect(c.correctionId.startsWith(`${wsL}:`)).toBe(true);
    }

    // priorityRank is 1..n contiguous, topCorrection is rank 1.
    expect(routing!.corrections.map((c) => c.priorityRank)).toEqual(routing!.corrections.map((_, i) => i + 1));
    expect(routing!.topCorrection!.priorityRank).toBe(1);

    // The routing is derived from the same breakdowns Process Intelligence surfaced.
    const sourceTypes = new Set(out.processIntelligence!.findings.map((f) => f.findingType));
    expect(routing!.corrections.every((c) => sourceTypes.has(c.sourceFindingType))).toBe(true);

    // Real evidence flows through: at least one correction carries operational-event or escalation ids.
    const linked = routing!.corrections.some((c) => c.supportingOperationalEventIds.length > 0 || c.supportingEscalationIds.length > 0);
    expect(linked).toBe(true);

    // If the escalation breakdown routed, its escalation-targeted corrections carry the real manager id (never fabricated).
    const escCorr = routing!.corrections.filter((c) => c.sourceFindingType === "ESCALATION_RESPONSE_BREAKDOWN");
    for (const c of escCorr) expect(c.targetManagerId).toBe(mgr);

    // At least one correction requires owner approval (owner-gated breakdowns are present) and it is not hidden.
    expect(routing!.corrections.some((c) => c.requiresOwnerApproval)).toBe(true);

    // No fabricated financial amount, no fraud/negligence label, no hidden score anywhere in the payload.
    const json = JSON.stringify(routing);
    expect(json).not.toMatch(NO_FRAUD);
    expect(json).not.toMatch(/hidden\s*score/i);
    expect(json).not.toMatch(/"expectedImpact":\s*\d/);
  });

  it("a clean workspace routes only a DATA_INSUFFICIENT correction and leaks no evidence", async () => {
    const out = await getOwnerNowView(wsClean);
    const routing = out.processCorrections;
    expect(routing).not.toBeNull();
    expect(routing!.corrections.length).toBe(1);
    const only = routing!.corrections[0];
    expect(only.sourceFindingType).toBe("DATA_INSUFFICIENT");
    expect(["COLLECT_MISSING_DATA", "NO_ACTION_DATA_INSUFFICIENT"]).toContain(only.correctionType);
    // No owner action is demanded on an empty workspace.
    expect(only.requiresOwnerApproval).toBe(false);
    // None of wsL's evidence ids leaked across the workspace boundary.
    const json = JSON.stringify(routing);
    expect(json).not.toContain(esc1);
    expect(json).not.toContain(p1);
  });
});
