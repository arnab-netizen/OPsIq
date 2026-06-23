import { describe, it, expect } from "vitest";
import {
  classifyLearningCandidate,
  validateCandidatePromotion,
  buildCandidateAuditEntry,
  assertCandidateImmutable,
  ELIGIBILITY_ALLOWS_PROMOTION,
  ELIGIBILITY_IS_TERMINAL,
  CANDIDATE_SOURCE_REQUIRES_REAL_WORLD,
  type ControlledLearningCandidateInput,
  type ControlledLearningPromotionInput,
} from "../../../domain/owner-mode/controlled-learning";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WS = "ws-001";

const APPROVED_RECORD = {
  ownerDecisionId: "od-1",
  ownerDecisionVerdict: "approved" as const,
  ownerDecisionWorkspaceId: WS,
  actionId: "act-1",
  actionWasTaken: true,
  actionWorkspaceId: WS,
  outcomeId: "out-1",
  outcomeWindowElapsed: true,
  outcomeWorkspaceId: WS,
  humanApprovedBy: "alice@example.com",
  humanApprovedAt: "2026-06-19T10:00:00Z",
  humanReviewWorkspaceId: WS,
};

function validInput(overrides: Partial<ControlledLearningCandidateInput> = {}): ControlledLearningCandidateInput {
  return {
    workspaceId: WS,
    sourceLabel: "HUMAN_VERIFIED_CANDIDATE",
    evidenceOrigin: "owner_manual_entry",
    publicSourceFullTextVerified: false,
    originatingWorkspaceId: WS,
    involvesSafetyRelatedFailure: false,
    hasConflictingEvidence: false,
    candidateRecord: { ...APPROVED_RECORD },
    ...overrides,
  };
}

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("classifyLearningCandidate — workspace scoping", () => {
  it("throws when workspaceId is empty string", () => {
    expect(() => classifyLearningCandidate(validInput({ workspaceId: "" }))).toThrow("SEC-007/008");
  });

  it("throws when workspaceId is whitespace only", () => {
    expect(() => classifyLearningCandidate(validInput({ workspaceId: "   " }))).toThrow("SEC-007/008");
  });

  it("accepts non-empty workspaceId", () => {
    const result = classifyLearningCandidate(validInput());
    expect(result.violations).toEqual([]);
  });
});

// ─── Happy path: LEARNING_ELIGIBLE_HUMAN_REVIEWED ────────────────────────────

describe("classifyLearningCandidate — eligible paths", () => {
  it("returns LEARNING_ELIGIBLE_HUMAN_REVIEWED for HUMAN_VERIFIED_CANDIDATE with full records", () => {
    const result = classifyLearningCandidate(validInput());
    expect(result.status).toBe("LEARNING_ELIGIBLE_HUMAN_REVIEWED");
    expect(result.eligible).toBe(true);
    expect(result.allowsPromotion).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.rejectionReasons).toHaveLength(0);
  });

  it("returns LEARNING_ELIGIBLE_VERIFIED_OUTCOME for REAL_SOURCE_BACKED_CANDIDATE with full-text verified", () => {
    const result = classifyLearningCandidate(
      validInput({
        sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
        publicSourceFullTextVerified: true,
      })
    );
    expect(result.status).toBe("LEARNING_ELIGIBLE_VERIFIED_OUTCOME");
    expect(result.eligible).toBe(true);
  });

  it("SYNTHETIC_ONLY_CANDIDATE with human approval returns LEARNING_ELIGIBLE_HUMAN_REVIEWED", () => {
    const result = classifyLearningCandidate(validInput({ sourceLabel: "SYNTHETIC_ONLY_CANDIDATE" }));
    expect(result.status).toBe("LEARNING_ELIGIBLE_HUMAN_REVIEWED");
    expect(result.eligible).toBe(true);
  });
});

// ─── CL-RULE-1: workspace isolation ──────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-1 workspace isolation", () => {
  it("violation when ownerDecisionWorkspaceId differs", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, ownerDecisionWorkspaceId: "other-ws" },
      })
    );
    expect(result.violations.some((v) => v.includes("ownerDecisionWorkspaceId"))).toBe(true);
  });

  it("violation when actionWorkspaceId differs", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, actionWorkspaceId: "other-ws" },
      })
    );
    expect(result.violations.some((v) => v.includes("actionWorkspaceId"))).toBe(true);
  });

  it("violation when outcomeWorkspaceId differs", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, outcomeWorkspaceId: "other-ws" },
      })
    );
    expect(result.violations.some((v) => v.includes("outcomeWorkspaceId"))).toBe(true);
  });

  it("violation when humanReviewWorkspaceId differs", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, humanReviewWorkspaceId: "other-ws" },
      })
    );
    expect(result.violations.some((v) => v.includes("humanReviewWorkspaceId"))).toBe(true);
  });
});

// ─── CL-RULE-2: cross-tenant ──────────────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-2 cross-tenant rejection", () => {
  it("rejects cross-tenant origin as terminal", () => {
    const result = classifyLearningCandidate(validInput({ originatingWorkspaceId: "other-ws" }));
    expect(result.status).toBe("LEARNING_INELIGIBLE_CROSS_TENANT");
    expect(result.eligible).toBe(false);
    expect(result.isTerminalRejection).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
  });
});

// ─── CL-RULE-3: AI-generated evidence ────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-3 AI-generated evidence", () => {
  it("rejects AI-generated evidence as terminal", () => {
    const result = classifyLearningCandidate(validInput({ evidenceOrigin: "ai_generated" }));
    expect(result.status).toBe("LEARNING_INELIGIBLE_AI_GENERATED");
    expect(result.eligible).toBe(false);
    expect(result.isTerminalRejection).toBe(true);
  });
});

// ─── CL-RULE-4: synthetic benchmark ──────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-4 synthetic benchmark", () => {
  it("rejects synthetic_benchmark evidence as terminal", () => {
    const result = classifyLearningCandidate(validInput({ evidenceOrigin: "synthetic_benchmark" }));
    expect(result.status).toBe("LEARNING_INELIGIBLE_SYNTHETIC");
    expect(result.eligible).toBe(false);
    expect(result.isTerminalRejection).toBe(true);
  });
});

// ─── CL-RULE-5: search-snippet-only ──────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-5 search snippet", () => {
  it("rejects search_snippet_only as public source unverified", () => {
    const result = classifyLearningCandidate(validInput({ evidenceOrigin: "search_snippet_only" }));
    expect(result.status).toBe("LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED");
    expect(result.eligible).toBe(false);
    expect(result.isTerminalRejection).toBe(false);
  });
});

// ─── CL-RULE-6: REAL_SOURCE_BACKED requires full-text ────────────────────────

describe("classifyLearningCandidate — CL-RULE-6 real source requires full-text", () => {
  it("rejects REAL_SOURCE_BACKED_CANDIDATE without full-text verification", () => {
    const result = classifyLearningCandidate(
      validInput({
        sourceLabel: "REAL_SOURCE_BACKED_CANDIDATE",
        publicSourceFullTextVerified: false,
      })
    );
    expect(result.status).toBe("LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED");
    expect(result.eligible).toBe(false);
  });
});

// ─── CL-RULE-7: safety-related failure ───────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-7 safety-related failure", () => {
  it("rejects safety-related failure as terminal", () => {
    const result = classifyLearningCandidate(validInput({ involvesSafetyRelatedFailure: true }));
    expect(result.status).toBe("LEARNING_INELIGIBLE_SAFETY_RELATED");
    expect(result.eligible).toBe(false);
    expect(result.isTerminalRejection).toBe(true);
  });
});

// ─── CL-RULE-8: owner decision ───────────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-8 owner decision", () => {
  it("rejects when ownerDecisionVerdict is rejected", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, ownerDecisionVerdict: "rejected" },
      })
    );
    expect(result.status).toBe("LEARNING_INELIGIBLE_NO_OWNER_DECISION");
    expect(result.eligible).toBe(false);
  });

  it("rejects when ownerDecisionVerdict is deferred", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, ownerDecisionVerdict: "deferred" },
      })
    );
    expect(result.status).toBe("LEARNING_INELIGIBLE_NO_OWNER_DECISION");
  });

  it("violation when ownerDecisionId is empty", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, ownerDecisionId: "" },
      })
    );
    expect(result.violations.some((v) => v.includes("ownerDecisionId"))).toBe(true);
  });
});

// ─── CL-RULE-9: action taken ─────────────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-9 action taken", () => {
  it("rejects when actionWasTaken is false", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, actionWasTaken: false },
      })
    );
    expect(result.status).toBe("LEARNING_INELIGIBLE_NO_ACTION_TAKEN");
    expect(result.eligible).toBe(false);
  });

  it("violation when actionId is empty", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, actionId: "" },
      })
    );
    expect(result.violations.some((v) => v.includes("actionId"))).toBe(true);
  });
});

// ─── CL-RULE-10: outcome window ──────────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-10 outcome window", () => {
  it("rejects when outcomeWindowElapsed is false", () => {
    const result = classifyLearningCandidate(
      validInput({
        candidateRecord: { ...APPROVED_RECORD, outcomeWindowElapsed: false },
      })
    );
    expect(result.status).toBe("LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW");
    expect(result.eligible).toBe(false);
  });
});

// ─── CL-RULE-11: conflicting evidence ────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-11 conflicting evidence", () => {
  it("rejects conflicting evidence and requires review", () => {
    const result = classifyLearningCandidate(validInput({ hasConflictingEvidence: true }));
    expect(result.status).toBe("LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE");
    expect(result.eligible).toBe(false);
    expect(result.isTerminalRejection).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
  });
});

// ─── CL-RULE-12/13: human approval ───────────────────────────────────────────

describe("classifyLearningCandidate — CL-RULE-12/13 human approval gate", () => {
  it("rejects system_computed evidence without human approval", () => {
    const result = classifyLearningCandidate(
      validInput({
        evidenceOrigin: "system_computed",
        candidateRecord: { ...APPROVED_RECORD, humanApprovedBy: null, humanApprovedAt: null },
      })
    );
    expect(result.status).toBe("LEARNING_INELIGIBLE_UNVERIFIED");
    expect(result.eligible).toBe(false);
  });

  it("accepts owner_file_upload without human approval (owner-supplied)", () => {
    const result = classifyLearningCandidate(
      validInput({
        evidenceOrigin: "owner_file_upload",
        candidateRecord: { ...APPROVED_RECORD, humanApprovedBy: null, humanApprovedAt: null },
      })
    );
    // No human approval yet → awaiting approval
    expect(result.status).toBe("LEARNING_INELIGIBLE_UNVERIFIED");
    expect(result.eligible).toBe(false);
    expect(result.isTerminalRejection).toBe(false);
  });

  it("owner_csv evidence with human approval returns eligible", () => {
    const result = classifyLearningCandidate(validInput({ evidenceOrigin: "owner_csv" }));
    expect(result.status).toBe("LEARNING_ELIGIBLE_HUMAN_REVIEWED");
    expect(result.eligible).toBe(true);
  });

  it("owner_pdf evidence with human approval returns eligible", () => {
    const result = classifyLearningCandidate(validInput({ evidenceOrigin: "owner_pdf" }));
    expect(result.status).toBe("LEARNING_ELIGIBLE_HUMAN_REVIEWED");
    expect(result.eligible).toBe(true);
  });
});

// ─── No engine mutation ───────────────────────────────────────────────────────

describe("classifyLearningCandidate — no engine mutation", () => {
  it("returns a plain result object without any engine state side effects", () => {
    const input = validInput();
    const result = classifyLearningCandidate(input);
    // Result must be a plain data object only
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    // No mutation of input
    expect(input.workspaceId).toBe(WS);
  });

  it("calling twice with same input returns identical results", () => {
    const input = validInput();
    const r1 = classifyLearningCandidate(input);
    const r2 = classifyLearningCandidate(input);
    expect(r1.status).toBe(r2.status);
    expect(r1.eligible).toBe(r2.eligible);
    expect(r1.violations).toEqual(r2.violations);
  });
});

// ─── validateCandidatePromotion ───────────────────────────────────────────────

describe("validateCandidatePromotion", () => {
  function validPromotion(overrides: Partial<ControlledLearningPromotionInput> = {}): ControlledLearningPromotionInput {
    return {
      workspaceId: WS,
      candidateId: "cand-1",
      approvedBy: "alice@example.com",
      approvedAt: "2026-06-19T10:00:00Z",
      sourceLabel: "HUMAN_VERIFIED_CANDIDATE",
      ...overrides,
    };
  }

  it("throws on empty workspaceId", () => {
    expect(() => validateCandidatePromotion(validPromotion({ workspaceId: "" }))).toThrow("SEC-007/008");
  });

  it("rejects empty approvedBy", () => {
    const result = validateCandidatePromotion(validPromotion({ approvedBy: "" }));
    expect(result.approved).toBe(false);
    expect(result.violations.some((v) => v.includes("approvedBy"))).toBe(true);
  });

  it("rejects empty approvedAt", () => {
    const result = validateCandidatePromotion(validPromotion({ approvedAt: "" }));
    expect(result.approved).toBe(false);
    expect(result.violations.some((v) => v.includes("approvedAt"))).toBe(true);
  });

  it("rejects empty candidateId", () => {
    const result = validateCandidatePromotion(validPromotion({ candidateId: "" }));
    expect(result.approved).toBe(false);
    expect(result.violations.some((v) => v.includes("candidateId"))).toBe(true);
  });

  it("approves valid promotion", () => {
    const result = validateCandidatePromotion(validPromotion());
    expect(result.approved).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects whitespace-only approvedBy", () => {
    const result = validateCandidatePromotion(validPromotion({ approvedBy: "   " }));
    expect(result.approved).toBe(false);
  });
});

// ─── buildCandidateAuditEntry ─────────────────────────────────────────────────

describe("buildCandidateAuditEntry", () => {
  it("throws on empty workspaceId", () => {
    expect(() => buildCandidateAuditEntry("", "cand-1", "SUBMITTED", null, "test detail", "2026-06-19T10:00:00Z")).toThrow("SEC-007/008");
  });

  it("throws on empty candidateId", () => {
    expect(() => buildCandidateAuditEntry(WS, "", "SUBMITTED", null, "test detail", "2026-06-19T10:00:00Z")).toThrow("candidateId");
  });

  it("throws on empty detail", () => {
    expect(() => buildCandidateAuditEntry(WS, "cand-1", "SUBMITTED", null, "", "2026-06-19T10:00:00Z")).toThrow("detail");
  });

  it("throws on empty timestamp", () => {
    expect(() => buildCandidateAuditEntry(WS, "cand-1", "SUBMITTED", null, "test detail", "")).toThrow("timestamp");
  });

  it("builds SUBMITTED entry with null actorId", () => {
    const entry = buildCandidateAuditEntry(WS, "cand-1", "SUBMITTED", null, "candidate submitted", "2026-06-19T10:00:00Z");
    expect(entry.action).toBe("SUBMITTED");
    expect(entry.actorId).toBeNull();
    expect(entry.workspaceId).toBe(WS);
  });

  it("builds HUMAN_APPROVED entry with actorId", () => {
    const entry = buildCandidateAuditEntry(WS, "cand-1", "HUMAN_APPROVED", "alice@example.com", "human approved", "2026-06-19T10:00:00Z");
    expect(entry.action).toBe("HUMAN_APPROVED");
    expect(entry.actorId).toBe("alice@example.com");
  });

  it("builds PROMOTED entry", () => {
    const entry = buildCandidateAuditEntry(WS, "cand-1", "PROMOTED", "alice@example.com", "promoted to learning round", "2026-06-19T10:00:00Z");
    expect(entry.action).toBe("PROMOTED");
  });

  it("builds REJECTED entry", () => {
    const entry = buildCandidateAuditEntry(WS, "cand-1", "REJECTED", "system", "safety-related failure", "2026-06-19T10:00:00Z");
    expect(entry.action).toBe("REJECTED");
  });

  it("preserves all fields exactly", () => {
    const ts = "2026-06-19T10:00:00Z";
    const entry = buildCandidateAuditEntry(WS, "cand-42", "SUBMITTED", "bob", "submitted by bob", ts);
    expect(entry).toEqual({
      workspaceId: WS,
      candidateId: "cand-42",
      action: "SUBMITTED",
      actorId: "bob",
      timestamp: ts,
      detail: "submitted by bob",
    });
  });
});

// ─── assertCandidateImmutable ─────────────────────────────────────────────────

describe("assertCandidateImmutable — append-only invariant", () => {
  it("throws when LEARNING_ELIGIBLE_VERIFIED_OUTCOME is mutated", () => {
    expect(() =>
      assertCandidateImmutable(
        "LEARNING_ELIGIBLE_VERIFIED_OUTCOME",
        "LEARNING_INELIGIBLE_UNVERIFIED"
      )
    ).toThrow("Append-only violation");
  });

  it("throws when LEARNING_ELIGIBLE_HUMAN_REVIEWED is mutated", () => {
    expect(() =>
      assertCandidateImmutable(
        "LEARNING_ELIGIBLE_HUMAN_REVIEWED",
        "LEARNING_INELIGIBLE_UNVERIFIED"
      )
    ).toThrow("Append-only violation");
  });

  it("does not throw when eligible status stays the same", () => {
    expect(() =>
      assertCandidateImmutable(
        "LEARNING_ELIGIBLE_HUMAN_REVIEWED",
        "LEARNING_ELIGIBLE_HUMAN_REVIEWED"
      )
    ).not.toThrow();
  });

  it("does not throw when ineligible status changes (non-promoted)", () => {
    expect(() =>
      assertCandidateImmutable(
        "LEARNING_INELIGIBLE_UNVERIFIED",
        "LEARNING_ELIGIBLE_HUMAN_REVIEWED"
      )
    ).not.toThrow();
  });
});

// ─── Constant table coverage ──────────────────────────────────────────────────

describe("ELIGIBILITY_ALLOWS_PROMOTION constant table", () => {
  it("allows promotion for LEARNING_ELIGIBLE_VERIFIED_OUTCOME", () => {
    expect(ELIGIBILITY_ALLOWS_PROMOTION["LEARNING_ELIGIBLE_VERIFIED_OUTCOME"]).toBe(true);
  });

  it("allows promotion for LEARNING_ELIGIBLE_HUMAN_REVIEWED", () => {
    expect(ELIGIBILITY_ALLOWS_PROMOTION["LEARNING_ELIGIBLE_HUMAN_REVIEWED"]).toBe(true);
  });

  it("blocks promotion for all INELIGIBLE statuses", () => {
    const ineligible = [
      "LEARNING_INELIGIBLE_UNVERIFIED",
      "LEARNING_INELIGIBLE_SYNTHETIC",
      "LEARNING_INELIGIBLE_AI_GENERATED",
      "LEARNING_INELIGIBLE_CROSS_TENANT",
      "LEARNING_INELIGIBLE_NO_OWNER_DECISION",
      "LEARNING_INELIGIBLE_NO_ACTION_TAKEN",
      "LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW",
      "LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE",
      "LEARNING_INELIGIBLE_SAFETY_RELATED",
      "LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED",
    ] as const;
    for (const s of ineligible) {
      expect(ELIGIBILITY_ALLOWS_PROMOTION[s]).toBe(false);
    }
  });
});

describe("ELIGIBILITY_IS_TERMINAL constant table", () => {
  it("marks SYNTHETIC as terminal", () => {
    expect(ELIGIBILITY_IS_TERMINAL["LEARNING_INELIGIBLE_SYNTHETIC"]).toBe(true);
  });

  it("marks AI_GENERATED as terminal", () => {
    expect(ELIGIBILITY_IS_TERMINAL["LEARNING_INELIGIBLE_AI_GENERATED"]).toBe(true);
  });

  it("marks CROSS_TENANT as terminal", () => {
    expect(ELIGIBILITY_IS_TERMINAL["LEARNING_INELIGIBLE_CROSS_TENANT"]).toBe(true);
  });

  it("marks SAFETY_RELATED as terminal", () => {
    expect(ELIGIBILITY_IS_TERMINAL["LEARNING_INELIGIBLE_SAFETY_RELATED"]).toBe(true);
  });

  it("does not mark CONFLICTING_EVIDENCE as terminal (can be reviewed)", () => {
    expect(ELIGIBILITY_IS_TERMINAL["LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE"]).toBe(false);
  });
});

describe("CANDIDATE_SOURCE_REQUIRES_REAL_WORLD", () => {
  it("REAL_SOURCE_BACKED_CANDIDATE requires real world", () => {
    expect(CANDIDATE_SOURCE_REQUIRES_REAL_WORLD["REAL_SOURCE_BACKED_CANDIDATE"]).toBe(true);
  });

  it("SYNTHETIC_ONLY_CANDIDATE does not require real world", () => {
    expect(CANDIDATE_SOURCE_REQUIRES_REAL_WORLD["SYNTHETIC_ONLY_CANDIDATE"]).toBe(false);
  });

  it("HUMAN_VERIFIED_CANDIDATE does not require real world", () => {
    expect(CANDIDATE_SOURCE_REQUIRES_REAL_WORLD["HUMAN_VERIFIED_CANDIDATE"]).toBe(false);
  });
});
