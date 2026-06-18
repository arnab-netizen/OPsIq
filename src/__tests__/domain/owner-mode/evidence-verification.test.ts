import { describe, it, expect } from "vitest";
import {
  EVIDENCE_VERIFICATION_STATUS_TRANSITIONS,
  AI_IS_NOT_A_VERIFIER,
  AI_VERIFIER_TYPES,
  OWNER_OPINION_ONLY_SOURCE_TYPES,
  isVerificationStatusTransitionAllowed,
  validateEvidenceVerification,
  ownerStatementRequiresCorroboration,
  verificationAllowsLearning,
  type EvidenceVerificationInput,
} from "@/domain/owner-mode/evidence-verification";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function validInput(overrides: Partial<EvidenceVerificationInput> = {}): EvidenceVerificationInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    evidenceId: "evidence-001",
    verifierType: "admin",
    verificationMethod: "manual_review",
    verificationReason: "Reviewed supporting documents and confirmed supplier contract is genuine.",
    sourceType: "document",
    hasCorroboratingSource: true,
    ...overrides,
  };
}

// ─── AI invariant ─────────────────────────────────────────────────────────────

describe("AI is never a verifier", () => {
  it("AI_IS_NOT_A_VERIFIER is true", () => {
    expect(AI_IS_NOT_A_VERIFIER).toBe(true);
  });

  it("AI_VERIFIER_TYPES is empty — AI has no verifier role", () => {
    expect(AI_VERIFIER_TYPES).toHaveLength(0);
  });
});

// ─── Owner opinion invariant ───────────────────────────────────────────────────

describe("owner statement handling", () => {
  it("OWNER_OPINION_ONLY_SOURCE_TYPES includes owner_statement", () => {
    expect(OWNER_OPINION_ONLY_SOURCE_TYPES).toContain("owner_statement");
  });

  it("ownerStatementRequiresCorroboration returns true for owner_statement", () => {
    expect(ownerStatementRequiresCorroboration("owner_statement")).toBe(true);
  });

  it("ownerStatementRequiresCorroboration returns false for document", () => {
    expect(ownerStatementRequiresCorroboration("document")).toBe(false);
  });

  it("owner_statement without corroboration → ownerOpinionOnly = true", () => {
    const result = validateEvidenceVerification(
      validInput({ sourceType: "owner_statement", hasCorroboratingSource: false })
    );
    expect(result.ownerOpinionOnly).toBe(true);
  });

  it("owner_statement with corroboration → ownerOpinionOnly = false", () => {
    const result = validateEvidenceVerification(
      validInput({ sourceType: "owner_statement", hasCorroboratingSource: true })
    );
    expect(result.ownerOpinionOnly).toBe(false);
  });

  it("owner_statement without corroboration → status is insufficient", () => {
    const result = validateEvidenceVerification(
      validInput({ sourceType: "owner_statement", hasCorroboratingSource: false })
    );
    expect(result.verificationStatus).toBe("insufficient");
  });

  it("owner_statement without corroboration does not allow learning", () => {
    const result = validateEvidenceVerification(
      validInput({ sourceType: "owner_statement", hasCorroboratingSource: false })
    );
    expect(result.allowsLearning).toBe(false);
  });
});

// ─── Status machine ───────────────────────────────────────────────────────────

describe("verification status machine", () => {
  it("has exactly 6 statuses", () => {
    expect(Object.keys(EVIDENCE_VERIFICATION_STATUS_TRANSITIONS).length).toBe(6);
  });

  it("rejected is terminal", () => {
    expect(EVIDENCE_VERIFICATION_STATUS_TRANSITIONS.rejected).toHaveLength(0);
  });

  it("verified → stale is allowed", () => {
    expect(isVerificationStatusTransitionAllowed("verified", "stale")).toBe(true);
  });

  it("verified → conflicting is allowed", () => {
    expect(isVerificationStatusTransitionAllowed("verified", "conflicting")).toBe(true);
  });

  it("verified → rejected is NOT allowed", () => {
    expect(isVerificationStatusTransitionAllowed("verified", "rejected")).toBe(false);
  });

  it("rejected → verified is NOT allowed (terminal)", () => {
    expect(isVerificationStatusTransitionAllowed("rejected", "verified")).toBe(false);
  });

  it("stale → needs_more_evidence is allowed", () => {
    expect(isVerificationStatusTransitionAllowed("stale", "needs_more_evidence")).toBe(true);
  });

  it("conflicting → verified is allowed", () => {
    expect(isVerificationStatusTransitionAllowed("conflicting", "verified")).toBe(true);
  });

  it("insufficient → verified is allowed", () => {
    expect(isVerificationStatusTransitionAllowed("insufficient", "verified")).toBe(true);
  });

  it("needs_more_evidence → verified is allowed", () => {
    expect(isVerificationStatusTransitionAllowed("needs_more_evidence", "verified")).toBe(true);
  });
});

// ─── EVVER-RULE-1: verificationReason ────────────────────────────────────────

describe("EVVER-RULE-1: verificationReason required (min 10 chars)", () => {
  it("violation when reason is empty", () => {
    const result = validateEvidenceVerification(validInput({ verificationReason: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EVVER-RULE-1"))).toBe(true);
  });

  it("violation when reason is too short", () => {
    const result = validateEvidenceVerification(validInput({ verificationReason: "ok done" }));
    expect(result.violations.some((v) => v.includes("EVVER-RULE-1"))).toBe(true);
  });

  it("no violation when reason is sufficient", () => {
    const result = validateEvidenceVerification(validInput());
    expect(result.violations.some((v) => v.includes("EVVER-RULE-1"))).toBe(false);
  });
});

// ─── EVVER-RULE-2: conflicting evidence needs notes ───────────────────────────

describe("EVVER-RULE-2: conflictNotes required when conflictsWithOtherEvidence", () => {
  it("violation when conflicting without notes", () => {
    const result = validateEvidenceVerification(
      validInput({ conflictsWithOtherEvidence: true, conflictNotes: undefined })
    );
    expect(result.violations.some((v) => v.includes("EVVER-RULE-2"))).toBe(true);
  });

  it("violation when conflicting with empty notes", () => {
    const result = validateEvidenceVerification(
      validInput({ conflictsWithOtherEvidence: true, conflictNotes: "   " })
    );
    expect(result.violations.some((v) => v.includes("EVVER-RULE-2"))).toBe(true);
  });

  it("no violation when conflicting with sufficient notes", () => {
    const result = validateEvidenceVerification(
      validInput({ conflictsWithOtherEvidence: true, conflictNotes: "This contradicts the invoice from Q2." })
    );
    expect(result.violations.some((v) => v.includes("EVVER-RULE-2"))).toBe(false);
  });

  it("no violation when not conflicting without notes", () => {
    const result = validateEvidenceVerification(validInput({ conflictsWithOtherEvidence: false }));
    expect(result.violations.some((v) => v.includes("EVVER-RULE-2"))).toBe(false);
  });
});

// ─── EVVER-RULE-5: evidenceId required ───────────────────────────────────────

describe("EVVER-RULE-5: evidenceId required", () => {
  it("violation when evidenceId is empty", () => {
    const result = validateEvidenceVerification(validInput({ evidenceId: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EVVER-RULE-5"))).toBe(true);
  });

  it("no violation when evidenceId provided", () => {
    const result = validateEvidenceVerification(validInput());
    expect(result.violations.some((v) => v.includes("EVVER-RULE-5"))).toBe(false);
  });
});

// ─── Verification outcomes ────────────────────────────────────────────────────

describe("verification status outcomes", () => {
  it("clean input → status is verified", () => {
    const result = validateEvidenceVerification(validInput());
    expect(result.verificationStatus).toBe("verified");
  });

  it("outdated evidence → status is stale", () => {
    const result = validateEvidenceVerification(validInput({ evidenceIsOutdated: true }));
    expect(result.verificationStatus).toBe("stale");
  });

  it("conflicting evidence → status is conflicting", () => {
    const result = validateEvidenceVerification(
      validInput({ conflictsWithOtherEvidence: true, conflictNotes: "Contradicts the bank export." })
    );
    expect(result.verificationStatus).toBe("conflicting");
  });

  it("invalid input → status is needs_more_evidence", () => {
    const result = validateEvidenceVerification(validInput({ verificationReason: "short" }));
    expect(result.verificationStatus).toBe("needs_more_evidence");
  });
});

// ─── Confidence level ─────────────────────────────────────────────────────────

describe("confidence level derivation", () => {
  it("clean document verification → confidence medium or higher", () => {
    const result = validateEvidenceVerification(validInput());
    expect(["high", "medium"]).toContain(result.confidenceLevel);
  });

  it("caller-supplied high confidence is preserved", () => {
    const result = validateEvidenceVerification(validInput({ confidenceLevel: "high" }));
    expect(result.confidenceLevel).toBe("high");
  });

  it("conflicting evidence → confidence is none", () => {
    const result = validateEvidenceVerification(
      validInput({ conflictsWithOtherEvidence: true, conflictNotes: "Contradicts bank records." })
    );
    expect(result.confidenceLevel).toBe("none");
  });

  it("outdated evidence → confidence is low", () => {
    const result = validateEvidenceVerification(validInput({ evidenceIsOutdated: true }));
    expect(result.confidenceLevel).toBe("low");
  });

  it("owner statement without corroboration → confidence is low", () => {
    const result = validateEvidenceVerification(
      validInput({ sourceType: "owner_statement", hasCorroboratingSource: false })
    );
    expect(result.confidenceLevel).toBe("low");
  });
});

// ─── blocksHighConfidence ─────────────────────────────────────────────────────

describe("blocksHighConfidence", () => {
  it("conflicting evidence blocks high confidence", () => {
    const result = validateEvidenceVerification(
      validInput({ conflictsWithOtherEvidence: true, conflictNotes: "See Q2 bank statement." })
    );
    expect(result.blocksHighConfidence).toBe(true);
  });

  it("outdated evidence blocks high confidence", () => {
    const result = validateEvidenceVerification(validInput({ evidenceIsOutdated: true }));
    expect(result.blocksHighConfidence).toBe(true);
  });

  it("owner opinion alone blocks high confidence", () => {
    const result = validateEvidenceVerification(
      validInput({ sourceType: "owner_statement", hasCorroboratingSource: false })
    );
    expect(result.blocksHighConfidence).toBe(true);
  });

  it("clean document verification does not block high confidence", () => {
    const result = validateEvidenceVerification(validInput());
    expect(result.blocksHighConfidence).toBe(false);
  });
});

// ─── Learning eligibility ─────────────────────────────────────────────────────

describe("allowsLearning", () => {
  it("verified document → allows learning", () => {
    const result = validateEvidenceVerification(validInput());
    expect(result.allowsLearning).toBe(true);
  });

  it("conflicting evidence → does not allow learning", () => {
    const result = validateEvidenceVerification(
      validInput({ conflictsWithOtherEvidence: true, conflictNotes: "Contradicts invoice." })
    );
    expect(result.allowsLearning).toBe(false);
  });

  it("owner opinion alone → does not allow learning", () => {
    const result = validateEvidenceVerification(
      validInput({ sourceType: "owner_statement", hasCorroboratingSource: false })
    );
    expect(result.allowsLearning).toBe(false);
  });

  it("stale evidence → does not allow learning", () => {
    const result = validateEvidenceVerification(validInput({ evidenceIsOutdated: true }));
    expect(result.allowsLearning).toBe(false);
  });

  it("verificationAllowsLearning helper mirrors result.allowsLearning", () => {
    const result = validateEvidenceVerification(validInput());
    expect(verificationAllowsLearning(result)).toBe(result.allowsLearning);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => validateEvidenceVerification(validInput({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => validateEvidenceVerification(validInput({ workspaceId: "   " }))).toThrow();
  });
});

// ─── Valid complete inputs ─────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("admin manual_review of document → valid", () => {
    const result = validateEvidenceVerification(validInput({ verifierType: "admin" }));
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("external_record cross_reference → valid", () => {
    const result = validateEvidenceVerification(
      validInput({ verifierType: "external_record", verificationMethod: "cross_reference" })
    );
    expect(result.valid).toBe(true);
  });

  it("system system_audit → valid", () => {
    const result = validateEvidenceVerification(
      validInput({ verifierType: "system", verificationMethod: "system_audit" })
    );
    expect(result.valid).toBe(true);
  });
});
