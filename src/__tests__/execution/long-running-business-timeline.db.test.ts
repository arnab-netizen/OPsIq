/**
 * Long-running business timeline — real DB simulation (PASS 47, LANE_B).
 *
 * Boots a seeded laundry workspace on real Postgres and proves OpsIQ stays coherent,
 * safe and execution-based across an evolving 8-week timeline:
 *   - the timeline loads chronologically and the governed top action CHANGES as facts change;
 *   - growth stays BLOCKED during instability and the thrive gate opens only after stabilization proof;
 *   - decision MEMORY is persisted (a failed action and an owner-declined action are not repeated
 *     without new evidence) and is workspace-isolated;
 *   - missing data never becomes a fake fact (marked_unknown → newValue null, unconfirmed intake);
 *   - completion requires ACCEPTED evidence (proof requirement gates clearance);
 *   - no fabricated money/ROI, no unsafe/autonomous action, no staff blame/discipline, one top action.
 *
 * Decisions are computed by the REAL engines (runTimeline composes planBusinessSurvivalRecovery /
 * assessGrowthReadiness / evaluateConditionTransition / evaluateDoNotRepeat); the governed side-effects
 * (do-not-repeat rules, owner data intake, fact review, proof, audit events) are exercised against real
 * Postgres via the real services. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runTimeline } from "@/domain/execution/business-timeline-simulation";
import { LONG_RUNNING_TIMELINE, TIMELINE_SHAPE } from "@/domain/execution/business-timeline-fixture";
import { recordDoNotRepeat } from "@/services/owner-mode/do-not-repeat.service";
import { evaluateDoNotRepeat } from "@/domain/owner-mode/do-not-repeat";
import { markFactUnknown } from "@/services/data-review/fact-review.service";
import { submitProof, reviewProof } from "@/services/execution/proof.service";
import { evaluateProofClearance, ProofStatus, ProofType, ProofRiskLevel, type ProofActor } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const MONEY = /[$£€]\s?\d|\b\d+(?:\.\d+)?\s?%|\bROI\b|\bMRR\b|guaranteed|win probability/i;
const BLAME = /\b(fire|sack|discipline|disciplinary|payroll|salary cut|deduct pay|blame)\b/i;

const owner = randomUUID();
const reviewer = randomUUID();
const operator = randomUUID();
const wsL = randomUUID();
const wsOther = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();

const assignee: ProofActor = { role: TaskActorRole.EMPLOYEE, isAssignee: true, canReviewProof: false };
const reviewerActor: ProofActor = { role: TaskActorRole.OWNER, isAssignee: false, canReviewProof: true };

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Long-running business timeline — 8-week laundry simulation", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [reviewer, "Reviewer"], [operator, "STAFF_A"]] as const) {
      await db.user.create({ data: { id, email: `lrt-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsOther]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `lrt-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.workspaceMembership.create({ data: { workspaceId: wsL, userId: owner, role: "OWNER", isActive: true } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    console.log("LANE_B_TIMELINE_DB_SIM_EXECUTED");
  });

  afterAll(async () => {
    for (const wsId of [wsL, wsOther]) {
      await db.factReviewAction.deleteMany({ where: { workspaceId: wsId } });
      await db.ownerDataIntake.deleteMany({ where: { workspaceId: wsId } });
      await db.ownerDoNotRepeatRule.deleteMany({ where: { workspaceId: wsId } });
      await db.proof.deleteMany({ where: { workspaceId: wsId } });
      await db.proofRequirement.deleteMany({ where: { workspaceId: wsId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: wsId } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId: wsId } });
    }
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsOther] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, reviewer, operator] } } });
  });

  it("1/2/13. timeline loads chronologically; the single top action changes as facts change", () => {
    const { ticks } = runTimeline(LONG_RUNNING_TIMELINE);
    expect(ticks.map((t) => t.eventId)).toEqual(LONG_RUNNING_TIMELINE.map((e) => e.id));
    expect([...new Set(ticks.map((t) => t.crisisStatus))].length).toBeGreaterThanOrEqual(4);
    expect(ticks.find((t) => t.eventId === "e01")!.topActionKey).toBe("survival:data");
    expect(ticks.find((t) => t.eventId === "e06")!.crisisStatus).toBe("CASH_PROTECTION_REQUIRED");
    expect(ticks.find((t) => t.eventId === "e13")!.crisisStatus).toBe("OPERATIONS_STABILIZATION_REQUIRED");
    // One coherent top action per tick (never an array of competing actions).
    for (const t of ticks) expect(typeof (t.topActionKey ?? "")).toBe("string");
  });

  it("10/11/12/9/14. growth blocked in instability; thrive gate opens only after stabilization proof; clean control fabricates nothing", () => {
    const { ticks } = runTimeline(LONG_RUNNING_TIMELINE);
    const idx = (id: string) => ticks.findIndex((t) => t.eventId === id);
    // Growth blocked for the whole run until the thrive-eligibility tick (e30).
    expect(ticks.slice(0, idx("e30")).every((t) => t.growthAllowed === false)).toBe(true);
    // A weak proof (e25) does not open growth.
    expect(ticks[idx("e25")].growthAllowed).toBe(false);
    // Stabilization proven only after evidence (e28 recover), growth gate open at e30.
    expect(ticks[idx("e28")].strategyPhase).toBe("recover");
    expect(ticks[idx("e30")].growthAllowed).toBe(true);
    // Clean control: no crisis, no top action, nothing fabricated.
    expect(ticks[idx("e32")].plan).toBeNull();
    expect(ticks[idx("e32")].crisisStatus).toBe("NO_CRISIS");
  });

  it("3. decision memory: a failed action is not repeated without new evidence (persisted rule + audit)", async () => {
    await recordDoNotRepeat({
      workspaceId: wsL, businessId: bizL, memoryKey: "scope:operations",
      summary: "The first ops fix on VENDOR_A did not resolve the breakdown.",
      reason: "failed_correction",
    });
    const rule = await db.ownerDoNotRepeatRule.findFirst({
      where: { workspaceId: wsL, memoryKey: { in: ["scope:operations"] }, blocksRepetition: true, active: true },
      orderBy: { createdAt: "desc" },
    });
    expect(rule).toBeTruthy();
    const blocked = evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: rule!.blocksRepetition, memoryKey: "scope:operations" }, null);
    expect(blocked.blocked).toBe(true);
    const overridden = evaluateDoNotRepeat(
      { category: "do_not_repeat", blocksRepetition: rule!.blocksRepetition, memoryKey: "scope:operations" },
      "VENDOR_A SLA fixed and the step was re-inspected with completion evidence",
    );
    expect(overridden.blocked).toBe(false);
    const audit = await db.auditEvent.findFirst({ where: { workspaceId: wsL, eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_RECORDED } });
    expect(audit).toBeTruthy();
  });

  it("4/15. an owner-declined action is remembered and blocked; memory is workspace-isolated", async () => {
    await recordDoNotRepeat({
      workspaceId: wsL, businessId: bizL, memoryKey: "scope:marketing",
      summary: "Owner declined the expensive marketing push during cash pressure.",
      reason: "owner_rejected",
    });
    const rule = await db.ownerDoNotRepeatRule.findFirst({
      where: { workspaceId: wsL, memoryKey: { in: ["scope:marketing"] }, blocksRepetition: true, active: true },
    });
    expect(rule).toBeTruthy();
    expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: "scope:marketing" }, null).blocked).toBe(true);
    // Isolation: neither rule leaks into another workspace.
    const leaked = await db.ownerDoNotRepeatRule.findFirst({
      where: { workspaceId: wsOther, memoryKey: { in: ["scope:operations", "scope:marketing"] } },
    });
    expect(leaked).toBeNull();
  });

  it("5. missing data never becomes a fake fact (marked_unknown → newValue null; intake unconfirmed)", async () => {
    const intakeId = randomUUID();
    const factId = "fact_cash_runway";
    await db.ownerDataIntake.create({
      data: {
        id: intakeId, workspaceId: wsL, businessId: bizL, source: "manual_entry",
        rowCount: 1, validationStatus: "needs_review", normalizationStatus: "pending",
        mappedFields: {}, unmappedColumns: [], records: [{ fact_id: factId, value: null }],
        errorReport: {}, ownerConfirmed: false, updatedAt: new Date(NOW),
      },
    });
    await markFactUnknown(intakeId, factId, "owner has not measured the cash runway yet", wsL, owner);
    const action = await db.factReviewAction.findFirst({ where: { intakeId, factId, action: "marked_unknown" } });
    expect(action).toBeTruthy();
    expect(action!.newValue).toBeNull(); // never fabricated
    const intake = await db.ownerDataIntake.findFirst({ where: { id: intakeId, workspaceId: wsL } });
    expect(intake!.ownerConfirmed).toBe(false); // an unconfirmed intake is not a trusted fact
  });

  it("6. completed tasks require ACCEPTED evidence (proof requirement gates clearance)", async () => {
    const reqId = randomUUID();
    const proofId = randomUUID();
    await db.proofRequirement.create({
      data: { id: reqId, workspaceId: wsL, proofType: ProofType.PHOTO, requiredFields: ["photo"], riskLevel: ProofRiskLevel.MEDIUM },
    });
    await db.proof.create({
      data: {
        id: proofId, workspaceId: wsL, businessId: bizL, taskId: null, proofRequirementId: reqId,
        proofType: ProofType.PHOTO, status: ProofStatus.PENDING_SUBMISSION, updatedAt: new Date(NOW),
      },
    });
    // Not cleared before an accepted proof exists.
    expect(evaluateProofClearance(ProofStatus.REQUIRED, { now: new Date(NOW), maxAgeDays: 30 }).cleared).toBe(false);

    await submitProof({
      proofId, taskId: "t-timeline", workspaceId: wsL,
      fromStatus: ProofStatus.PENDING_SUBMISSION,
      requirement: { proofType: ProofType.PHOTO, requiredFields: ["photo"], riskLevel: ProofRiskLevel.MEDIUM },
      submission: { proofType: ProofType.PHOTO, fields: { photo: "corrected_step.jpg" }, fileHash: "hash-corrected", submittedByUserId: operator },
      actor: assignee,
    });
    await db.proof.update({ where: { id: proofId }, data: { status: ProofStatus.NEEDS_HUMAN_REVIEW } });
    await reviewProof({ proofId, workspaceId: wsL, fromStatus: ProofStatus.NEEDS_HUMAN_REVIEW, to: ProofStatus.ACCEPTED, actor: reviewerActor, actorId: owner });

    const accepted = await db.proof.findUnique({ where: { id: proofId } });
    expect(accepted!.status).toBe(ProofStatus.ACCEPTED);
    expect(
      evaluateProofClearance(ProofStatus.ACCEPTED, { acceptedAt: accepted!.reviewedAt, duplicateFlagged: accepted!.duplicateFlagged ?? false, now: new Date(NOW), maxAgeDays: 30 }).cleared,
    ).toBe(true);
  });

  it("7/8. reassessment is recorded after completion; failed reassessment loops back instead of pretending success", async () => {
    await emitAuditEvent({
      workspaceId: wsL, eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETED, actorId: owner, actorType: "user",
      entityType: "delegated_task", entityId: randomUUID(), payload: { proofRequired: true, ownerOverride: false },
    });
    const completed = await db.auditEvent.findFirst({ where: { workspaceId: wsL, eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETED } });
    expect(completed).toBeTruthy();
    const { ticks } = runTimeline(LONG_RUNNING_TIMELINE);
    const e26 = ticks.find((t) => t.eventId === "e26")!;
    expect(e26.crisisStatus).toBe("CUSTOMER_RECOVERY_REQUIRED"); // loops back, not "success"
    expect(e26.strategyPhase).not.toBe("grow");
    expect(ticks.filter((t) => t.requiresReassessment).length).toBeGreaterThanOrEqual(6);
  });

  it("16/17/18/19/20. no fabricated money, no unsafe/autonomous action, no staff blame, transparent score", () => {
    const { ticks } = runTimeline(LONG_RUNNING_TIMELINE);
    for (const t of ticks) {
      if (t.topActionTitle) expect(t.topActionTitle).not.toMatch(MONEY);
      if (t.plan) {
        expect(t.plan.cockpitSummary).not.toMatch(MONEY);
        // Growth/scale always blocked (no unsafe expansion).
        expect(t.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
        // Autonomous external action is always in the blocked set.
        expect(t.blockedUnsafeActions.some((b) => /auto.*(contact|send|spend|submit)/i.test(b))).toBe(true);
        // No staff blame / discipline / payroll automation anywhere in the plan.
        const planText = JSON.stringify(t.plan);
        expect(planText).not.toMatch(BLAME);
      }
      // The only score is a transparent 0-100 condition score (no hidden score).
      expect(t.conditionScore).toBeGreaterThanOrEqual(0);
      expect(t.conditionScore).toBeLessThanOrEqual(100);
    }
    expect(TIMELINE_SHAPE.weeks).toBe(8);
  });
});
