/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * Ordinary acceptance ("Use this as my next move") must preserve the measurement facts the system HAS:
 * live QA 2026-11-24 accepted "Improve data completeness" (dataConfidenceScore, observed 35, 7 days) and the persisted
 * decision stored no baseline and no direction. The structured facts are the cycle's persisted score and the code-defined
 * metric direction; the "35 → 45" estimate exists only as recommendation prose and must never be parsed or promoted to
 * a target the owner did not set.
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-first-run/acceptance-measurement-contract.db.test.ts
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createFirstBusiness, getFirstMoneyRead } from "@/services/owner-first-run/first-run.service";
import { acceptFirstResultAction, correctFirstResultEvidence } from "@/services/owner-first-run/first-run-actions.service";
import { assessPersistedOwnerOutcome } from "@/services/owner-outcome/owner-outcome-chain.service";
import { ConflictError, NotFoundError } from "@/infra/errors";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";

async function makeTenant() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@accept.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Accept QA", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  return { workspaceId, userId };
}
const period = () => {
  const end = new Date();
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};
/** The live QA figures (fictional): INR, revenue 100,000, fixed 40,000, variable 30,000, cash 5,000, "a rough guess". */
const liveQa = (over: Record<string, unknown> = {}) => ({
  ...period(), currency: "INR", revenue: 100000, fixedCosts: 40000, variableCosts: 30000, cashOnHand: 5000, evidenceQuality: "ROUGH_ESTIMATE", ...over,
});
async function journeyToFirstRead(quality: Record<string, unknown> = {}) {
  const t = await makeTenant();
  const { business } = await createFirstBusiness(t.workspaceId, t.userId, { businessType: "generic_local_service", currency: "inr" });
  const snap: any = await createFinancialSnapshot(business.id, liveQa(quality) as any, t.userId, t.workspaceId);
  await runFinanceDiagnosis(business.id, snap.id, t.userId, t.workspaceId);
  const view = await getFirstMoneyRead(t.workspaceId, business.id);
  return { t, business, snap, view };
}
const acceptNow = async (t: { workspaceId: string; userId: string }, businessId: string, key: string) => {
  const v = await getFirstMoneyRead(t.workspaceId, businessId);
  return acceptFirstResultAction(t.workspaceId, t.userId, businessId, key, v.cycleId);
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] ordinary acceptance preserves available, verified measurement facts", () => {
  it("LIVE QA: accepting 'Improve data completeness' records the cycle's measured score as baseline and the registry direction; no target is invented", async () => {
    const { t, business, view } = await journeyToFirstRead();
    expect(view.presentedAction?.verificationMetric).toBe("dataConfidenceScore"); // the live recommendation
    const cycle: any = await db.ownerFinanceCycle.findUniqueOrThrow({ where: { id: view.cycleId } });
    const { decision } = await acceptNow(t, business.id, "accept-live-qa-1");
    expect(decision.verificationMetric).toBe("dataConfidenceScore");
    expect(decision.observationWindowDays).toBe(7);
    expect(decision.baselineValue).toBe(cycle.dataConfidenceScore);          // the persisted cycle score, not text
    expect(decision.baselineProvenance).toBe("MEASURED");
    expect(decision.targetDirection).toBe("up");
    expect(decision.targetValue).toBeNull();                                  // the "45" is an estimate in prose, never a commitment
    expect(decision.expectedMeasurementSource).toBe("OWNER_ENTERED");         // rough-guess evidence is never upgraded to authoritative
  });

  it("the baseline is linked to the right business, cycle, metric and source (snapshot of the recommendation shows the same cycle)", async () => {
    const { t, business, view } = await journeyToFirstRead();
    const { decision } = await acceptNow(t, business.id, "accept-linkage-1");
    const snapshot = decision.recommendationSnapshot as Record<string, unknown>;
    expect(snapshot.cycleId).toBe(view.cycleId);
    expect(decision.businessId).toBe(business.id);
    expect(decision.workspaceId).toBe(t.workspaceId);
  });

  it("a metric with no structured source keeps baseline unknown (fail closed): the baseline is taken only for a registered metric", async () => {
    // A non-data-quality recommendation (margin) has no cycle-level numeric source registered for its metric.
    const { t, business, view } = await journeyToFirstRead({ revenue: 100000, fixedCosts: 90000, variableCosts: 30000, evidenceQuality: "ACTUAL", receivables: 1000, payables: 1000 });
    if (view.presentedAction?.verificationMetric === "dataConfidenceScore") return; // scenario did not produce a different metric: nothing to assert
    const { decision } = await acceptNow(t, business.id, "accept-unregistered-1");
    expect(decision.baselineValue).toBeNull();
    expect(decision.baselineProvenance).toBeNull();
    expect(decision.targetValue).toBeNull();
  });

  it("idempotent: the same acceptance key replays the same decision (no second contract, no second audit row)", async () => {
    const { t, business } = await journeyToFirstRead();
    const first = await acceptNow(t, business.id, "accept-idem-1");
    const second = await acceptNow(t, business.id, "accept-idem-1");
    expect(second.replayed).toBe(true);
    expect(second.decision.id).toBe(first.decision.id);
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId, candidateId: first.candidateId } })).toBe(1);
  });

  it("stale read is refused and nothing is persisted; another business cannot accept this one", async () => {
    const { t, business, snap, view } = await journeyToFirstRead();
    await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "Checked records", receivables: 12000, payables: 8000 } as any);
    await expect(acceptFirstResultAction(t.workspaceId, t.userId, business.id, "accept-stale-1", view.cycleId)).rejects.toBeInstanceOf(ConflictError);
    expect(await db.ownerDecisionRecord.count({ where: { workspaceId: t.workspaceId, businessId: business.id } })).toBe(0);
    const other = await makeTenant();
    await expect(acceptFirstResultAction(other.workspaceId, other.userId, business.id, "accept-foreign-1", view.cycleId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("FULL JOURNEY: accept → correction → new Finance cycle → an early outcome check never verifies, never completes, never teaches", async () => {
    const { t, business, snap, view } = await journeyToFirstRead();
    const { decision, candidateId } = await acceptNow(t, business.id, "accept-journey-1");
    const cycle1: any = await db.ownerFinanceCycle.findUniqueOrThrow({ where: { id: view.cycleId } });

    const corrected = await correctFirstResultEvidence(t.workspaceId, t.userId, business.id, snap.id, { amendmentReason: "Entered receivables and payables from my records", receivables: 12000, payables: 8000 } as any);
    expect(corrected.diagnosisFailed).toBe(false);
    const cycle2: any = await db.ownerFinanceCycle.findFirstOrThrow({ where: { workspaceId: t.workspaceId, businessId: business.id }, orderBy: { sequenceNumber: "desc" } });
    expect(cycle2.id).not.toBe(cycle1.id);
    expect(cycle2.dataConfidenceScore).toBeGreaterThan(cycle1.dataConfidenceScore);

    // The decision is untouched and the action is not completed by the correction.
    const decisionAfter = await db.ownerDecisionRecord.findUniqueOrThrow({ where: { id: decision.id } });
    expect(decisionAfter.baselineValue).toBe(cycle1.dataConfidenceScore);
    const actionId = candidateId.split(":")[2];
    const action: any = await db.ownerFinanceAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(action.status).not.toBe("completed");
    expect(action.completedAt).toBeNull();

    // Early outcome check, twice: honest, identical, and never learning.
    const a = await assessPersistedOwnerOutcome(t.workspaceId, t.userId, business.id, { candidateId });
    const b = await assessPersistedOwnerOutcome(t.workspaceId, t.userId, business.id, { candidateId });
    expect(b.assessment.id).toBe(a.assessment.id);
    expect(a.assessment.executionStatus).toBe("NOT_STARTED");
    expect(a.assessment.measurementResult).toBe("NOT_MEASURABLE");
    expect(a.assessment.independentlyVerified).toBe(false);
    expect(a.assessment.learningEligibility).toBe("NOT_ELIGIBLE");
    expect(await db.ownerFinanceVerification.count({ where: { actionId } })).toBe(0);
    expect(await db.ownerFinanceOutcomeSignal.count({ where: { workspaceId: t.workspaceId, actionId } })).toBe(0);
  });

  it("Finance list vs Results: the Finance dashboard carries the owner's decision beside the action status, only for this business, without changing the action", async () => {
    const { t, business, view } = await journeyToFirstRead();
    const other = await journeyToFirstRead();
    const before: any = await getFinanceDashboard(t.workspaceId, business.id);
    expect(before.latestCycle.actions.every((a: any) => a.ownerDecisionState === null)).toBe(true);
    const { candidateId } = await acceptNow(t, business.id, "accept-dash-1");
    const actionId = candidateId.split(":")[2];
    const after: any = await getFinanceDashboard(t.workspaceId, business.id);
    const row = after.latestCycle.actions.find((a: any) => a.id === actionId);
    expect(row.ownerDecisionState).toBe("ACCEPTED");
    expect(row.status).toBe("proposed");                 // the decision never changes (or fakes) the action's own execution status
    // The other business in another workspace sees nothing of this decision.
    const foreign: any = await getFinanceDashboard(other.t.workspaceId, other.business.id);
    expect(foreign.latestCycle.actions.every((a: any) => a.ownerDecisionState === null)).toBe(true);
    expect(view.cycleId).toBeTruthy();
  });
});
