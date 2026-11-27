/**
 * Decision → measurement-specification handoff on System A (Finance) chains.
 *
 * Live QA 2026-11-24 (internal account): an accepted "Improve data completeness" decision showed
 * dataConfidenceScore with no starting value, direction or target in Results, although the recommendation text
 * named 35 → 45. These tests pin, against real Postgres:
 *   - what the persisted decision contract carries (the owner's own words),
 *   - what the assessment snapshot (the policy's input) is built from,
 *   - that nothing is ever invented: no baseline, target, direction, execution completion or measured "after".
 */
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { NotFoundError } from "@/infra/errors";
import { recordOwnerDecision } from "@/services/owner-outcome/owner-decision.service";
import { assessPersistedOwnerOutcome } from "@/services/owner-outcome/owner-outcome-chain.service";
import { NOW, daysAgo, seedFinanceAction, seedFinanceCycle, seedTenant, type Tenant } from "./outcome-db-fixtures";

const deps = { now: () => NOW };
type Snap = {
  baselineValue: number | null; baselineProvenance: string; afterValue: number | null; targetValue: number | null;
  direction: string; windowDays: number | null; executionStatus: string; verificationMetric: string | null;
};

async function proposedDataQualityAction(tn: Tenant) {
  const cyc = await seedFinanceCycle(tn, { periodEnd: daysAgo(10), generatedAt: daysAgo(10), findings: [{ code: "FIN_OPP_DATA_QUALITY", severity: "medium" }] });
  const action = await seedFinanceAction(tn, {
    cycleId: cyc.cycleId, findingCode: "FIN_OPP_DATA_QUALITY", status: "proposed", completedAt: null,
    metric: "dataConfidenceScore", timeframeDays: 7, title: "Improve data completeness",
  });
  return { ...action, cycleId: cyc.cycleId };
}
const assess = (tn: Tenant, candidateId: string) => assessPersistedOwnerOutcome(tn.ws, tn.actor, tn.biz, { candidateId }, deps);

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Finance decision → outcome measurement handoff", () => {
  it("INTENDED: accepting with no contract keeps baseline, direction and target unknown — nothing is invented — and the outcome is NOT_MEASURABLE / learning NOT_ELIGIBLE", async () => {
    const tn = await seedTenant();
    const a = await proposedDataQualityAction(tn);
    await recordOwnerDecision(tn.ws, tn.actor, tn.biz, { candidateId: a.candidateId, state: "ACCEPTED" }, deps);
    const { assessment } = await assess(tn, a.candidateId);
    const snap = assessment.inputSnapshot as Snap;
    expect(snap.baselineValue).toBeNull();
    expect(snap.baselineProvenance).toBe("UNKNOWN");
    expect(snap.targetValue).toBeNull();
    expect(snap.direction).toBe("unknown");
    expect(snap.afterValue).toBeNull();
    expect(assessment.executionStatus).toBe("NOT_STARTED");
    expect(assessment.measurementResult).toBe("NOT_MEASURABLE");
    expect(assessment.targetAttainment).toBe("UNKNOWN");
    expect(assessment.independentlyVerified).toBe(false);
    expect(assessment.learningEligibility).toBe("NOT_ELIGIBLE");
  });

  it("a newer Finance cycle / corrected snapshot never marks the accepted action executed and never fabricates an after-value", async () => {
    const tn = await seedTenant();
    const a = await proposedDataQualityAction(tn);
    await recordOwnerDecision(tn.ws, tn.actor, tn.biz, { candidateId: a.candidateId, state: "ACCEPTED" }, deps);
    // Cycle #2 (the owner corrected the snapshot): a different cycle, later evidence, higher confidence.
    await seedFinanceCycle(tn, { periodEnd: daysAgo(2), generatedAt: daysAgo(1), findings: [] });
    const { assessment } = await assess(tn, a.candidateId);
    const snap = assessment.inputSnapshot as Snap;
    expect(assessment.executionStatus).toBe("NOT_STARTED");
    expect(snap.afterValue).toBeNull();
    expect(assessment.measurementResult).toBe("NOT_MEASURABLE");
    // The action row itself is untouched by the assessment.
    const row = await db.ownerFinanceAction.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("proposed");
    expect(row.completedAt).toBeNull();
  });

  it("repeated outcome checks with unchanged facts are idempotent (same version, nothing new written)", async () => {
    const tn = await seedTenant();
    const a = await proposedDataQualityAction(tn);
    await recordOwnerDecision(tn.ws, tn.actor, tn.biz, { candidateId: a.candidateId, state: "ACCEPTED" }, deps);
    const first = await assess(tn, a.candidateId);
    const second = await assess(tn, a.candidateId);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.assessment.id).toBe(first.assessment.id);
    expect(await db.ownerOutcomeAssessment.count({ where: { workspaceId: tn.ws, chainKey: first.assessment.chainKey } })).toBe(1);
  });

  it("cross-business isolation: another business in the same workspace, and another workspace, cannot assess this chain", async () => {
    const tn = await seedTenant();
    const other = await seedTenant();
    const a = await proposedDataQualityAction(tn);
    await recordOwnerDecision(tn.ws, tn.actor, tn.biz, { candidateId: a.candidateId, state: "ACCEPTED" }, deps);
    await expect(assessPersistedOwnerOutcome(tn.ws, tn.actor, tn.bizB, { candidateId: a.candidateId }, deps)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assessPersistedOwnerOutcome(other.ws, other.actor, other.biz, { candidateId: a.candidateId }, deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the owner's own recorded contract (starting value, direction, target, window) reaches the assessment input for a Finance action", async () => {
    const tn = await seedTenant();
    const a = await proposedDataQualityAction(tn);
    await recordOwnerDecision(tn.ws, tn.actor, tn.biz, {
      candidateId: a.candidateId, state: "ACCEPTED",
      contract: {
        verificationMetric: "dataConfidenceScore", baselineValue: 35, baselineProvenance: "MEASURED", targetDirection: "up", targetValue: 45,
        observationWindowDays: 7,
      },
    }, deps);
    const { assessment } = await assess(tn, a.candidateId);
    const snap = assessment.inputSnapshot as Snap;
    expect(snap.baselineValue).toBe(35);
    expect(snap.baselineProvenance).toBe("MEASURED");
    expect(snap.direction).toBe("up");
    expect(snap.targetValue).toBe(45);
    expect(snap.windowDays).toBe(7);
    // The contract states intent; it is not evidence. No execution, no after-value, no success.
    expect(assessment.executionStatus).toBe("NOT_STARTED");
    expect(snap.afterValue).toBeNull();
    expect(assessment.measurementResult).toBe("NOT_MEASURABLE");
    expect(assessment.learningEligibility).toBe("NOT_ELIGIBLE");
  });
});
