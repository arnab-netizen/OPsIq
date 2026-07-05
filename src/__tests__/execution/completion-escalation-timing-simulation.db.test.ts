/**
 * Completion / escalation timing evidence → unblocked risk signals — real-business DB simulation (laundry).
 *
 * Sparkle Laundry (workspace `wsL`). Five accepted 60-minute "wash" jobs establish a TRUSTED observed
 * baseline. Operator `opFast` then submits two wash jobs in ~4-5 minutes each — implausibly fast vs the
 * 60-min baseline → SUSPICIOUS_FAST_COMPLETION_PATTERN with the exact proof IDs (COMPLETE). Manager
 * `mgrLazy` leaves two HIGH escalations unacknowledged past their due time → MANAGER_IGNORES_ESCALATION
 * _PATTERN with the exact escalation IDs (COMPLETE). Both were BLOCKED_BY_DATA before this pass.
 *
 * Verifies: signals produced from persisted trusted timestamps; owner adjudication suppresses the exact
 * fast-completion proofs (a NEW fast job re-surfaces it); a clean workspace fabricates nothing; no
 * fraud/accusation label. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { adjudicateProofRiskFinding } from "@/services/execution/proof-risk-adjudication.service";
import { AdjudicationOutcome, AdjudicationSourceType } from "@/domain/execution/proof-risk-adjudication";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const owner = randomUUID();
const mgr = randomUUID();
const opFast = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const f1 = randomUUID();
const f2 = randomUUID();
const f3 = randomUUID();
const esc1 = randomUUID();
const esc2 = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const MIN = 60_000;
const NO_FRAUD = /fraud|fraudster|theft|thief|negligent|lazy/i;

const slo = (out: Awaited<ReturnType<typeof getOwnerNowView>>, t: string) =>
  out.businessControlHealth.slos.find((s) => s.sloType === t)!;

// A trusted, accepted 60-minute baseline wash job (reviewed by the manager — no self-review).
async function baselineJob(id: string, submitter: string, ago: number) {
  await db.proof.create({ data: {
    id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: submitter, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    workStartedAt: new Date(NOW - (ago * H) - 60 * MIN), submittedAt: new Date(NOW - ago * H),
    createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
}
// A suspiciously fast wash job (durMin minutes) submitted by opFast, awaiting review.
async function fastJob(id: string, durMin: number, ago: number) {
  await db.proof.create({ data: {
    id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "NEEDS_HUMAN_REVIEW",
    submittedByUserId: opFast, workStartedAt: new Date(NOW - (ago * H) - durMin * MIN), submittedAt: new Date(NOW - ago * H),
    createdAt: new Date(NOW - (ago * H) - durMin * MIN), updatedAt: new Date(NOW - ago * H),
  } });
}
// An unacknowledged, past-due HIGH escalation assigned to the manager.
async function ignoredEscalation(id: string) {
  await db.escalation.create({ data: {
    id, workspaceId: wsL, category: "customer_complaint", severity: "HIGH", assignedTarget: mgr,
    status: "OPEN", dueAt: new Date(NOW - 4 * H), createdAt: new Date(NOW - 5 * H),
  } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Completion / escalation timing evidence (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "MgrLazy"], [opFast, "OpFast"]] as const) {
      await db.user.create({ data: { id, email: `te-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `te-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    // Trusted baseline: five accepted 60-minute wash jobs by ordinary operators.
    for (let i = 0; i < 5; i++) await baselineJob(randomUUID(), randomUUID(), 20 + i);
    // Two implausibly fast wash jobs by opFast (4 and 5 minutes).
    await fastJob(f1, 4, 3);
    await fastJob(f2, 5, 2);
    // Two ignored escalations for the manager.
    await ignoredEscalation(esc1);
    await ignoredEscalation(esc2);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.proofRiskAdjudication.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.escalation.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, opFast] } } });
  });

  it("fast-completion + ignores-escalation are produced from persisted trusted timestamps (COMPLETE), no fraud label", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    // Fast-completion: pattern with the exact fast proof IDs, baseline from observed accepted history.
    const fast = out.timingEvidence?.fastCompletion;
    expect(fast?.status).toBe("SUSPICIOUS_FAST_COMPLETION_PATTERN");
    expect(fast?.actorId).toBe(opFast);
    expect((fast?.supportingProofIds ?? []).sort()).toEqual([f1, f2].sort());
    expect(fast?.sourceCompleteness).toBe("COMPLETE");
    expect(fast?.baselineSource).toMatch(/OBSERVED_ACCEPTED_HISTORY/);
    // Ignores-escalation: pattern with the exact escalation IDs.
    const esc = out.timingEvidence?.escalationTiming;
    expect(esc?.status).toBe("MANAGER_IGNORES_ESCALATION_PATTERN");
    expect(esc?.actorId).toBe(mgr);
    expect((esc?.supportingProofIds ?? []).sort()).toEqual([esc1, esc2].sort());
    expect(esc?.sourceCompleteness).toBe("COMPLETE");
    // Both surface into the gaming pipeline; the top gaming signal is one of the two timing signals.
    expect(["SUSPICIOUS_FAST_COMPLETION", "MANAGER_IGNORES_ESCALATION"]).toContain(out.topGamingSignal?.signalType);
    expect(slo(out, "ANTI_GAMING_RISK").status).toBe("FAIL");
    expect(JSON.stringify(out.timingEvidence)).not.toMatch(NO_FRAUD);
  });

  it("dismissing the fast-completion ANTI_GAMING_SIGNAL suppresses exactly those proofs", async () => {
    const r = await adjudicateProofRiskFinding({
      workspaceId: wsL, actorId: owner, actorRole: "owner",
      sourceType: AdjudicationSourceType.ANTI_GAMING_SIGNAL,
      sourceRef: `SUSPICIOUS_FAST_COMPLETION:${opFast}`,
      proofIds: [f1, f2], actorIds: [opFast],
      outcome: AdjudicationOutcome.DISMISS_FALSE_POSITIVE,
      reason: "Authorised express service for a VIP account — genuinely completed fast, not gaming.",
      idempotencyKey: `fast-dismiss:${opFast}`,
    });
    expect(r.status).toBe("CLEARED");
    const out = await getOwnerNowView(wsL, bizL);
    // The fast-completion signal is no longer selected as the top gaming signal (its proofs are cleared);
    // the ignored-escalation signal (different source, uncleared) is now the top gaming signal.
    expect(out.topGamingSignal?.signalType).toBe("MANAGER_IGNORES_ESCALATION");
  });

  it("a NEW suspiciously fast job re-surfaces the fast-completion signal (a cleared decision never hides future work)", async () => {
    await fastJob(f3, 3, 1); // new fast job, not covered by the dismissal
    const out = await getOwnerNowView(wsL, bizL);
    const fast = out.timingEvidence?.fastCompletion;
    expect(fast?.status).toBe("SUSPICIOUS_FAST_COMPLETION_PATTERN");
    // f3 is present in the fresh evidence; the signal is active again.
    expect(fast?.supportingProofIds).toContain(f3);
  });

  it("a clean workspace fabricates no timing signal (honest blocked/insufficient status, no bleed)", async () => {
    const out = await getOwnerNowView(wsClean);
    expect(out.timingEvidence?.fastCompletion?.status).toBe("DATA_INSUFFICIENT");
    expect(out.timingEvidence?.escalationTiming?.status).toBe("DATA_INSUFFICIENT");
    expect(out.topGamingSignal?.signalType).not.toBe("SUSPICIOUS_FAST_COMPLETION");
    expect(out.topGamingSignal?.signalType).not.toBe("MANAGER_IGNORES_ESCALATION");
  });

  it("TIMING_MISSING is honest: a workspace with proofs but no work-start time cannot fake a duration", async () => {
    // Proof with submittedAt but NO workStartedAt → the fast-completion evaluator must not measure it.
    const wsNoStart = wsClean; // reuse the clean workspace (currently empty)
    const pid = randomUUID();
    await db.proof.create({ data: {
      id: pid, workspaceId: wsNoStart, proofType: "wash", status: "NEEDS_HUMAN_REVIEW",
      submittedByUserId: opFast, submittedAt: new Date(NOW), workStartedAt: null,
      createdAt: new Date(NOW - MIN), updatedAt: new Date(NOW),
    } });
    const out = await getOwnerNowView(wsNoStart);
    expect(out.timingEvidence?.fastCompletion?.status).toBe("TIMING_MISSING");
    expect(out.timingEvidence?.fastCompletion?.sourceCompleteness).toBe("BLOCKED_BY_DATA");
    await db.proof.deleteMany({ where: { id: pid } });
  });
});
