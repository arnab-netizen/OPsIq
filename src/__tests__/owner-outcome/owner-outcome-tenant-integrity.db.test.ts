/**
 * Owner Outcome Persistence v1 — DIRECT database tenant-integrity proof.
 *
 * Bypasses every service: raw Prisma writes of malformed rows. The new tables must not let a row of workspace B point at
 * workspace A's business, decision or assessment (or at another candidate's chain), and must not allow a skipped
 * sequence/version link. These are the database's own guarantees, independent of service validation.
 *
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { recordOwnerDecision } from "@/services/owner-outcome/owner-decision.service";
import { assessPersistedOwnerOutcome } from "@/services/owner-outcome/owner-outcome-chain.service";
import { NOW, daysAgo, seedFinanceAction, seedFinanceCycle, seedFinanceVerification, seedTenant, type Tenant } from "./outcome-db-fixtures";

const deps = { now: () => NOW };
let A: Tenant;
let B: Tenant;

async function decided(tn: Tenant, biz = tn.biz) {
  const cyc = await seedFinanceCycle({ ws: tn.ws, biz }, { periodEnd: daysAgo(40), generatedAt: daysAgo(40) });
  const act = await seedFinanceAction({ ws: tn.ws, biz }, { cycleId: cyc.cycleId, status: "proposed" });
  const d = await recordOwnerDecision(tn.ws, tn.actor, biz, { candidateId: act.candidateId, state: "ACCEPTED", contract: {} }, deps);
  return { act, decision: d.decision };
}
async function assessed(tn: Tenant) {
  const cyc = await seedFinanceCycle(tn, { periodEnd: daysAgo(70), generatedAt: daysAgo(70) });
  const act = await seedFinanceAction(tn, { cycleId: cyc.cycleId, status: "completed", completedAt: daysAgo(30), timeframeDays: 1 });
  await seedFinanceVerification(tn, { actionId: act.id, before: 10, after: 14, verifiedAt: daysAgo(20) });
  return (await assessPersistedOwnerOutcome(tn.ws, tn.actor, tn.biz, { candidateId: act.candidateId }, deps)).assessment;
}

const decisionRow = (d: Record<string, unknown>, over: Record<string, unknown>) => {
  const { id: _i, createdAt: _c, ...rest } = d;
  void _i; void _c;
  return { ...rest, id: randomUUID(), requestFingerprint: `fp-${randomUUID()}`, idempotencyKey: null, ...over };
};
const assessmentRow = (a: Record<string, unknown>, over: Record<string, unknown>) => {
  const { id: _i, createdAt: _c, ...rest } = a;
  void _i; void _c;
  return { ...rest, id: randomUUID(), assessmentFingerprint: `fp-${randomUUID()}`, ...over };
};
const insertDecision = (row: Record<string, unknown>) => db.ownerDecisionRecord.create({ data: row as never });
const insertAssessment = (row: Record<string, unknown>) => db.ownerOutcomeAssessment.create({ data: row as never });

beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;
  A = await seedTenant();
  B = await seedTenant();
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] tenant relational integrity — the database itself refuses cross-tenant links", () => {
  it("1. OwnerDecisionRecord of workspace B pointing at a business of workspace A is refused", async () => {
    const { decision } = await decided(A);
    await expect(insertDecision(decisionRow(decision as never, { workspaceId: B.ws, candidateId: `domain_action:finance:${randomUUID()}` }))).rejects.toThrow();
  });

  it("2. OwnerOutcomeAssessment of workspace B pointing at a business of workspace A is refused", async () => {
    const a = await assessed(A);
    await expect(insertAssessment(assessmentRow(a as never, { workspaceId: B.ws, chainKey: `domain_action:finance:${randomUUID()}`, version: 1, previousAssessmentId: null, ownerDecisionId: null }))).rejects.toThrow();
  });

  it("3. OwnerOutcomeAssessment (A/A) pointing at a decision that belongs to workspace B is refused", async () => {
    const a = await assessed(A);
    const foreign = await decided(B);
    await expect(insertAssessment(assessmentRow(a as never, { chainKey: foreign.decision.candidateId, version: 1, previousAssessmentId: null, ownerDecisionId: foreign.decision.id }))).rejects.toThrow();
  });

  it("3b. …or at a decision of the same workspace but ANOTHER business, or another candidate's chain", async () => {
    const a = await assessed(A);
    const otherBiz = await decided(A, A.bizB);
    await expect(insertAssessment(assessmentRow(a as never, { chainKey: otherBiz.decision.candidateId, version: 1, previousAssessmentId: null, ownerDecisionId: otherBiz.decision.id }))).rejects.toThrow();
    const sameBizOtherCandidate = await decided(A);
    // the row's chain says one candidate, the linked decision belongs to another
    await expect(insertAssessment(assessmentRow(a as never, { chainKey: `domain_action:finance:${randomUUID()}`, version: 1, previousAssessmentId: null, ownerDecisionId: sameBizOtherCandidate.decision.id }))).rejects.toThrow();
  });

  it("4. supersedesId may not cross workspace, business or candidate", async () => {
    const mine = await decided(A);
    const foreign = await decided(B);
    const otherCandidate = await decided(A);
    const otherBiz = await decided(A, A.bizB);
    const base = mine.decision as unknown as Record<string, unknown>;
    for (const target of [foreign.decision, otherCandidate.decision, otherBiz.decision]) {
      await expect(insertDecision(decisionRow(base, { sequence: 2, supersedesId: target.id })), `supersedes ${target.id}`).rejects.toThrow();
    }
    // the legitimate link (same workspace, business and candidate, previous sequence) is accepted
    await expect(insertDecision(decisionRow(base, { sequence: 2, supersedesId: mine.decision.id }))).resolves.toBeTruthy();
  });

  it("5. previousAssessmentId may not cross workspace, business or chain", async () => {
    const mine = await assessed(A);
    const foreign = await assessed(B);
    const otherChain = await assessed(A);
    for (const target of [foreign, otherChain]) {
      await expect(insertAssessment(assessmentRow(mine as never, { version: 2, previousAssessmentId: target.id })), `previous ${target.id}`).rejects.toThrow();
    }
    await expect(insertAssessment(assessmentRow(mine as never, { version: 2, previousAssessmentId: mine.id }))).resolves.toBeTruthy();
  });

  it("6. a skipped sequence / version link is refused (previous must be exactly the preceding row)", async () => {
    const d = await decided(A);
    const base = d.decision as unknown as Record<string, unknown>;
    await expect(insertDecision(decisionRow(base, { sequence: 3, supersedesId: d.decision.id }))).rejects.toThrow();
    await expect(insertDecision(decisionRow(base, { sequence: 2, supersedesId: null }))).rejects.toThrow();
    const a = await assessed(A);
    await expect(insertAssessment(assessmentRow(a as never, { version: 3, previousAssessmentId: a.id }))).rejects.toThrow();
  });
});
