/**
 * AI-9 / AI-10 / AI-13 governed task runners — per-task guard tests.
 *
 * Proves each high-risk task is advisory-only and cannot finalize/approve/verify:
 * the schema forces the advisory markers (requiresOwnerApproval / advisoryOnly /
 * cannotVerifyAlone), and the shared guardrails still reject approval/verification
 * directives that leak into the output.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MockAiProvider, type AiContext } from "@/services/ai/provider";
import { buildAiContext } from "@/services/ai/context-builder";
import { clearAiCallLedger } from "@/services/ai/copilot";
import { runDiagnosisReview, runOwnerActionRedTeam, runOutcomeReview } from "@/services/ai/tasks";

const CLOCK = () => "2026-06-24T00:00:00.000Z";
function ctx(taskType: AiContext["taskType"], riskLevel: AiContext["riskLevel"] = "HIGH_DECISION"): AiContext {
  return buildAiContext({ workspaceId: "ws-1", taskType, riskLevel, items: [] });
}
const raw = (r: unknown) => new MockAiProvider({ kind: "raw", raw: r });

beforeEach(() => clearAiCallLedger());

describe("AI-9 diagnosis review (advisory, cannot finalize)", () => {
  const good = {
    taskType: "DIAGNOSIS_REVIEW",
    summary: "The diagnosis leans on a symptom, not a proven root cause.",
    evidenceUsed: [],
    evidenceMissing: ["margin trend"],
    counterEvidence: ["revenue rose while profit fell"],
    rootCauseChallenge: "Could be a margin issue, not demand.",
    alternativeHypotheses: ["cost inflation"],
    unsafeToConclude: true,
    recommendedNextStep: "request margin data",
    requiresOwnerApproval: true,
    citedEvidenceIds: [],
  };

  it("accepts a well-formed advisory review", async () => {
    const r = await runDiagnosisReview(raw(good), ctx("DIAGNOSIS_REVIEW"), { clock: CLOCK });
    expect(r.status).toBe("ACCEPTED");
    expect(r.output?.requiresOwnerApproval).toBe(true);
  });

  it("rejects schema where it tries to drop the owner-approval marker", async () => {
    const r = await runDiagnosisReview(raw({ ...good, requiresOwnerApproval: false }), ctx("DIAGNOSIS_REVIEW"), { clock: CLOCK });
    expect(r.status).toBe("REJECTED_SCHEMA_INVALID");
  });

  it("rejects a review that smuggles an approval directive into its text", async () => {
    const r = await runDiagnosisReview(
      raw({ ...good, recommendedNextStep: "I approve proceeding with the growth plan now." }),
      ctx("DIAGNOSIS_REVIEW"),
      { clock: CLOCK }
    );
    expect(r.status).toBe("REJECTED_UNAUTHORIZED_ACTION");
  });
});

describe("AI-10 owner-proposed-action red-team (classification advisory only)", () => {
  const good = {
    taskType: "OWNER_PROPOSED_ACTION_REDTEAM",
    classification: "CONVERT_TO_EXPERIMENT",
    weaknesses: ["no margin proof"],
    downside: "could erode margin if discount is permanent",
    saferAlternatives: ["small price test"],
    advisoryOnly: true,
    citedEvidenceIds: [],
  };

  it("accepts an advisory classification", async () => {
    const r = await runOwnerActionRedTeam(raw(good), ctx("OWNER_PROPOSED_ACTION_REDTEAM"), { clock: CLOCK });
    expect(r.status).toBe("ACCEPTED");
    expect(r.output?.classification).toBe("CONVERT_TO_EXPERIMENT");
    expect(r.output?.advisoryOnly).toBe(true);
  });

  it("rejects if it drops the advisory-only marker", async () => {
    const r = await runOwnerActionRedTeam(raw({ ...good, advisoryOnly: false }), ctx("OWNER_PROPOSED_ACTION_REDTEAM"), { clock: CLOCK });
    expect(r.status).toBe("REJECTED_SCHEMA_INVALID");
  });

  it("rejects an unsafe 'safe even if cash is low' reassurance in the downside text", async () => {
    const r = await runOwnerActionRedTeam(
      raw({ ...good, downside: "It is safe even if cash is low, just proceed." }),
      ctx("OWNER_PROPOSED_ACTION_REDTEAM"),
      { clock: CLOCK }
    );
    expect(r.status).toBe("REJECTED_POLICY_VIOLATION");
  });
});

describe("AI-13 outcome review (AI cannot verify alone)", () => {
  const good = {
    taskType: "OUTCOME_REVIEW",
    observations: ["metric moved up after the action"],
    confoundersDetected: ["seasonality"],
    missingProof: ["no baseline screenshot"],
    attributionWarning: "seasonal uplift may explain the change",
    verificationRecommendation: "needs_owner_review",
    cannotVerifyAlone: true,
    citedEvidenceIds: [],
  };

  it("accepts an advisory outcome review", async () => {
    const r = await runOutcomeReview(raw(good), ctx("OUTCOME_REVIEW", "HIGH_OUTCOME"), { clock: CLOCK });
    expect(r.status).toBe("ACCEPTED");
    expect(r.output?.verificationRecommendation).toBe("needs_owner_review");
  });

  it("rejects if it drops the cannot-verify-alone marker", async () => {
    const r = await runOutcomeReview(raw({ ...good, cannotVerifyAlone: false }), ctx("OUTCOME_REVIEW", "HIGH_OUTCOME"), { clock: CLOCK });
    expect(r.status).toBe("REJECTED_SCHEMA_INVALID");
  });

  it("rejects an outcome review that tries to self-verify the outcome", async () => {
    const r = await runOutcomeReview(
      raw({ ...good, observations: ["I mark this outcome as verified success."] }),
      ctx("OUTCOME_REVIEW", "HIGH_OUTCOME"),
      { clock: CLOCK }
    );
    expect(r.status).toBe("REJECTED_UNAUTHORIZED_ACTION");
  });
});
