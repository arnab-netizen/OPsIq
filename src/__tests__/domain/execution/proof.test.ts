import { describe, it, expect } from "vitest";
import {
  ProofStatus as PS,
  ProofType,
  ProofRiskLevel,
  ProofActor,
  planProofTransition,
  validateProofSubmission,
  isDuplicateFileHash,
  isProofClearedForCompletion,
  requiresHumanReview,
} from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";

const assignee: ProofActor = {
  role: TaskActorRole.EMPLOYEE,
  isAssignee: true,
  canReviewProof: false,
};
const otherEmployee: ProofActor = { ...assignee, isAssignee: false };
const reviewer: ProofActor = {
  role: TaskActorRole.MANAGER,
  isAssignee: false,
  canReviewProof: true,
};
const managerNoReview: ProofActor = { ...reviewer, canReviewProof: false };
const owner: ProofActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canReviewProof: true,
};
const system: ProofActor = {
  role: TaskActorRole.SYSTEM,
  isAssignee: false,
  canReviewProof: false,
};

describe("planProofTransition — submission", () => {
  it("assignee employee may submit; another employee may not", () => {
    expect(planProofTransition(PS.PENDING_SUBMISSION, PS.SUBMITTED, assignee).allowed).toBe(true);
    expect(planProofTransition(PS.PENDING_SUBMISSION, PS.SUBMITTED, otherEmployee).allowed).toBe(false);
  });
  it("employee may resubmit a rejected proof", () => {
    // reviewer rejects (with reason) → resubmission required → employee resubmits
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.REJECTED, reviewer, { reason: "blurry" }).allowed).toBe(true);
    expect(planProofTransition(PS.REJECTED, PS.RESUBMISSION_REQUIRED, reviewer).allowed).toBe(true);
    expect(planProofTransition(PS.RESUBMISSION_REQUIRED, PS.SUBMITTED, assignee).allowed).toBe(true);
  });
});

describe("planProofTransition — review authority", () => {
  it("owner / authorized manager may accept", () => {
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.ACCEPTED, owner).allowed).toBe(true);
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.ACCEPTED, reviewer).allowed).toBe(true);
  });
  it("a manager without review authority cannot accept/reject", () => {
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.ACCEPTED, managerNoReview).allowed).toBe(false);
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.REJECTED, managerNoReview, { reason: "x" }).allowed).toBe(false);
  });
  it("an employee can never accept or reject proof", () => {
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.ACCEPTED, assignee).allowed).toBe(false);
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.REJECTED, assignee, { reason: "x" }).allowed).toBe(false);
  });
  it("rejection requires a reason", () => {
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.REJECTED, reviewer).allowed).toBe(false);
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.REJECTED, reviewer, { reason: "" }).allowed).toBe(false);
    expect(planProofTransition(PS.NEEDS_HUMAN_REVIEW, PS.REJECTED, reviewer, { reason: "missing field" }).allowed).toBe(true);
  });
  it("AI/system cannot final-accept proof (only precheck/route to human)", () => {
    expect(planProofTransition(PS.SUBMITTED, PS.AI_PRECHECK_PASSED, system).allowed).toBe(true);
    expect(planProofTransition(PS.SUBMITTED, PS.NEEDS_HUMAN_REVIEW, system).allowed).toBe(true);
    expect(planProofTransition(PS.AI_PRECHECK_PASSED, PS.ACCEPTED, system).allowed).toBe(false);
  });
  it("only the owner may override (OVERRIDDEN_NOT_VERIFIED)", () => {
    expect(planProofTransition(PS.ACCEPTED, PS.OVERRIDDEN_NOT_VERIFIED, owner).allowed).toBe(true);
    expect(planProofTransition(PS.ACCEPTED, PS.OVERRIDDEN_NOT_VERIFIED, reviewer).allowed).toBe(false);
  });
  it("invalid graph transitions are rejected", () => {
    expect(planProofTransition(PS.REQUIRED, PS.ACCEPTED, owner).allowed).toBe(false);
  });
});

describe("validateProofSubmission", () => {
  const req = {
    proofType: ProofType.PAYMENT_CONFIRMATION,
    requiredFields: ["amount", "reference"],
    riskLevel: ProofRiskLevel.HIGH,
  };
  it("accepts a matching, complete submission", () => {
    const r = validateProofSubmission(req, {
      proofType: ProofType.PAYMENT_CONFIRMATION,
      fields: { amount: 500, reference: "TXN1" },
      submittedByUserId: "emp-1",
    });
    expect(r.ok).toBe(true);
  });
  it("flags a wrong proof type", () => {
    const r = validateProofSubmission(req, {
      proofType: ProofType.PHOTO,
      fields: { amount: 1, reference: "x" },
      submittedByUserId: "emp-1",
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith("WRONG_PROOF_TYPE"))).toBe(true);
  });
  it("enforces required fields", () => {
    const r = validateProofSubmission(req, {
      proofType: ProofType.PAYMENT_CONFIRMATION,
      fields: { amount: 500 },
      submittedByUserId: "emp-1",
    });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain("MISSING_FIELD: reference");
  });
});

describe("duplicate detection + completion gating + risk", () => {
  it("flags a duplicate file hash", () => {
    expect(isDuplicateFileHash("h1", new Set(["h1", "h2"]))).toBe(true);
    expect(isDuplicateFileHash("h3", new Set(["h1"]))).toBe(false);
    expect(isDuplicateFileHash(null, new Set(["h1"]))).toBe(false);
  });
  it("a task is cleared for completion only when proof is accepted or not required", () => {
    expect(isProofClearedForCompletion(PS.ACCEPTED)).toBe(true);
    expect(isProofClearedForCompletion(PS.NOT_REQUIRED)).toBe(true);
    expect(isProofClearedForCompletion(PS.SUBMITTED)).toBe(false);
    expect(isProofClearedForCompletion(PS.REJECTED)).toBe(false);
    expect(isProofClearedForCompletion(PS.OVERRIDDEN_NOT_VERIFIED)).toBe(false);
  });
  it("high-risk proof types always require human review", () => {
    expect(requiresHumanReview(ProofType.PAYMENT_CONFIRMATION, ProofRiskLevel.LOW)).toBe(true);
    expect(requiresHumanReview(ProofType.PHOTO, ProofRiskLevel.HIGH)).toBe(true);
    expect(requiresHumanReview(ProofType.PHOTO, ProofRiskLevel.LOW)).toBe(false);
  });
});
