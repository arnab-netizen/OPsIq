/**
 * Boundaries of Owner Outcome Persistence v1: persistence must not change learning, diagnosis, ranking or confidence,
 * and the Finance learning bridge keeps its (documented, deferred) decision-id behaviour so candidate fingerprints are unchanged.
 */
import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("FINANCE_LEARNING_DECISION_ID_MIGRATION=DEFERRED", () => {
  it("the Finance bridge still passes the diagnosis cycle id as the owner decision id (unchanged candidate identity)", () => {
    const src = read("src/services/owner-finance/learning-bridge.service.ts");
    expect(src).toMatch(/ownerDecisionId: action\.cycleId,/);
    expect(src).not.toMatch(/owner-outcome|OwnerDecisionRecord|ownerDecisionRecord/);
  });

  it("the controlled-learning candidate fingerprint is still workspace::decision::action::outcome", async () => {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      controlledLearningCandidate: { create: async (a: { data: Record<string, unknown> }) => { created.push(a.data); return { id: "cand-1" }; } },
      controlledLearningCandidateAuditEntry: { create: async () => ({}) },
    };
    const { createLearningCandidate } = await import("@/services/controlled-learning-candidate.service");
    const ws = "11111111-1111-4111-8111-111111111111";
    await createLearningCandidate(prisma as never, {
      workspaceId: ws, businessId: "b", evidenceSummary: "s", metadata: {},
      classificationInput: {
        workspaceId: ws, sourceLabel: "SYNTHETIC_ONLY_CANDIDATE", evidenceOrigin: "owner_manual_entry", publicSourceFullTextVerified: false, originatingWorkspaceId: ws,
        involvesSafetyRelatedFailure: false, hasConflictingEvidence: false,
        candidateRecord: {
          ownerDecisionId: "CYCLE-ID", ownerDecisionVerdict: "approved", ownerDecisionWorkspaceId: ws, actionId: "ACTION-ID", actionWasTaken: true, actionWorkspaceId: ws,
          outcomeId: "VERIFICATION-ID", outcomeWindowElapsed: true, outcomeWorkspaceId: ws, humanApprovedBy: null, humanApprovedAt: null, humanReviewWorkspaceId: ws,
        },
      },
    } as never);
    expect(created[0].auditFingerprint).toBe(`${ws}::CYCLE-ID::ACTION-ID::VERIFICATION-ID`);
    expect(created[0].sourceOwnerDecisionId).toBe("CYCLE-ID");
  });
});

describe("persistence is passive: no learning, diagnosis, ranking or confidence side effects", () => {
  const files = [
    "src/services/owner-outcome/owner-decision.service.ts",
    "src/services/owner-outcome/owner-outcome-chain.service.ts",
    "src/services/owner-outcome/outcome-sources.ts",
    "src/domain/owner-spine/owner-decision-record.ts",
    "src/domain/owner-spine/owner-outcome-spine.ts",
  ];
  it("does not import or call learning, candidate-creation, diagnosis-running, ranking or confidence modules", () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/controlled-learning|learning-bridge|determineLearningEligibility|determineAndCreateLearningCandidate|createLearningCandidate/);
      expect(src, f).not.toMatch(/run(Finance|Cashflow|Sales|Operations|Sop|Marketing|Strategy)Diagnosis|runCycle\(/);
      expect(src, f).not.toMatch(/rankOwnerCandidates|resolveOwnerDecision|compareOwnerCandidates/);
      expect(src, f).not.toMatch(/verifyOutcome\(/); // the spine never re-implements target logic
    }
  });
  it("never writes to a System A / System B source table", () => {
    const writes = /\.(create|update|updateMany|upsert|delete|deleteMany|createMany)\(/;
    const src = read("src/services/owner-outcome/outcome-sources.ts");
    expect(src).not.toMatch(writes);
  });
  it("assessments are only produced by assessOwnerOutcome over a built OwnerOutcomeInput", () => {
    const src = read("src/services/owner-outcome/owner-outcome-chain.service.ts");
    expect(src).toMatch(/assessOwnerOutcome\(built\.input\)/);
    expect(src.match(/measurementResult:/g)?.length).toBeLessThanOrEqual(2); // persisted from `assessment`, never from a request
  });
});
