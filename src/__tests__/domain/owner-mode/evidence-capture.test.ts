import { describe, it, expect } from "vitest";
import {
  EVIDENCE_STATUS_TRANSITIONS,
  isEvidenceStatusTransitionAllowed,
  validateEvidence,
  evidenceStartsUnverified,
  type EvidenceStatus,
  type EvidenceInput,
} from "@/domain/owner-mode/evidence-capture";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function validTextEvidence(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    relatedEntityType: "action",
    relatedEntityId: "action-001",
    submittedBy: "owner-001",
    sourceType: "owner_statement",
    evidenceText: "Completed all 3 supplier negotiations as agreed. Savings confirmed.",
    ...overrides,
  };
}

function validAttachmentEvidence(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    relatedEntityType: "action",
    relatedEntityId: "action-001",
    submittedBy: "owner-001",
    sourceType: "document",
    attachmentUrl: "https://storage.example.com/evidence/contract.pdf",
    originalFilename: "supplier_contract_q3.pdf",
    ...overrides,
  };
}

// ─── Status machine ───────────────────────────────────────────────────────────

describe("evidence status machine", () => {
  it("EVIDENCE_STATUS_TRANSITIONS has exactly 7 keys", () => {
    expect(Object.keys(EVIDENCE_STATUS_TRANSITIONS).length).toBe(7);
  });

  it("rejected is terminal", () => {
    expect(EVIDENCE_STATUS_TRANSITIONS.rejected).toHaveLength(0);
  });

  it("submitted → pending_verification is allowed", () => {
    expect(isEvidenceStatusTransitionAllowed("submitted", "pending_verification")).toBe(true);
  });

  it("submitted → rejected is allowed", () => {
    expect(isEvidenceStatusTransitionAllowed("submitted", "rejected")).toBe(true);
  });

  it("pending_verification → verified is allowed", () => {
    expect(isEvidenceStatusTransitionAllowed("pending_verification", "verified")).toBe(true);
  });

  it("pending_verification → conflicting is allowed", () => {
    expect(isEvidenceStatusTransitionAllowed("pending_verification", "conflicting")).toBe(true);
  });

  it("pending_verification → insufficient is allowed", () => {
    expect(isEvidenceStatusTransitionAllowed("pending_verification", "insufficient")).toBe(true);
  });

  it("verified → stale is allowed", () => {
    expect(isEvidenceStatusTransitionAllowed("verified", "stale")).toBe(true);
  });

  it("verified → submitted is NOT allowed (cannot un-verify)", () => {
    expect(isEvidenceStatusTransitionAllowed("verified", "submitted")).toBe(false);
  });

  it("stale → pending_verification is allowed (re-submit for re-verification)", () => {
    expect(isEvidenceStatusTransitionAllowed("stale", "pending_verification")).toBe(true);
  });

  it("rejected → pending_verification is NOT allowed", () => {
    expect(isEvidenceStatusTransitionAllowed("rejected", "pending_verification")).toBe(false);
  });

  it("insufficient → submitted is allowed (can resubmit)", () => {
    expect(isEvidenceStatusTransitionAllowed("insufficient", "submitted")).toBe(true);
  });
});

// ─── EV-RULE-1: evidenceText or attachmentUrl required ───────────────────────

describe("EV-RULE-1: evidenceText or attachmentUrl required", () => {
  it("violation when neither evidenceText nor attachmentUrl provided", () => {
    const result = validateEvidence(validTextEvidence({ evidenceText: undefined, attachmentUrl: undefined }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EV-RULE-1"))).toBe(true);
  });

  it("violation when evidenceText is too short (< 5) and no attachment", () => {
    const result = validateEvidence(validTextEvidence({ evidenceText: "ok" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EV-RULE-1"))).toBe(true);
  });

  it("valid when evidenceText is sufficient", () => {
    const result = validateEvidence(validTextEvidence());
    expect(result.violations.some((v) => v.includes("EV-RULE-1"))).toBe(false);
  });

  it("valid when only attachmentUrl provided (with filename)", () => {
    const result = validateEvidence(validAttachmentEvidence());
    expect(result.violations.some((v) => v.includes("EV-RULE-1"))).toBe(false);
  });
});

// ─── EV-RULE-2: submittedBy required ─────────────────────────────────────────

describe("EV-RULE-2: submittedBy required", () => {
  it("violation when submittedBy is empty", () => {
    const result = validateEvidence(validTextEvidence({ submittedBy: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EV-RULE-2"))).toBe(true);
  });

  it("violation when submittedBy is whitespace", () => {
    const result = validateEvidence(validTextEvidence({ submittedBy: "   " }));
    expect(result.violations.some((v) => v.includes("EV-RULE-2"))).toBe(true);
  });

  it("no violation when submittedBy is provided", () => {
    const result = validateEvidence(validTextEvidence());
    expect(result.violations.some((v) => v.includes("EV-RULE-2"))).toBe(false);
  });
});

// ─── EV-RULE-3: relatedEntityId required ─────────────────────────────────────

describe("EV-RULE-3: relatedEntityId required", () => {
  it("violation when relatedEntityId is empty", () => {
    const result = validateEvidence(validTextEvidence({ relatedEntityId: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EV-RULE-3"))).toBe(true);
  });

  it("no violation when relatedEntityId is provided", () => {
    const result = validateEvidence(validTextEvidence());
    expect(result.violations.some((v) => v.includes("EV-RULE-3"))).toBe(false);
  });
});

// ─── EV-RULE-4: originalFilename required with attachment ────────────────────

describe("EV-RULE-4: originalFilename required when attachmentUrl provided", () => {
  it("violation when attachmentUrl provided but no originalFilename", () => {
    const result = validateEvidence(validAttachmentEvidence({ originalFilename: undefined }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("EV-RULE-4"))).toBe(true);
  });

  it("no violation when both attachmentUrl and originalFilename provided", () => {
    const result = validateEvidence(validAttachmentEvidence());
    expect(result.violations.some((v) => v.includes("EV-RULE-4"))).toBe(false);
  });

  it("no violation when no attachmentUrl (filename not required)", () => {
    const result = validateEvidence(validTextEvidence({ originalFilename: undefined }));
    expect(result.violations.some((v) => v.includes("EV-RULE-4"))).toBe(false);
  });
});

// ─── Evidence starts unverified ───────────────────────────────────────────────

describe("evidence always starts as submitted (unverified)", () => {
  it("initialStatus is submitted for text evidence", () => {
    const result = validateEvidence(validTextEvidence());
    expect(result.initialStatus).toBe("submitted");
  });

  it("initialStatus is submitted for attachment evidence", () => {
    const result = validateEvidence(validAttachmentEvidence());
    expect(result.initialStatus).toBe("submitted");
  });

  it("evidenceStartsUnverified returns true for valid result", () => {
    const result = validateEvidence(validTextEvidence());
    expect(evidenceStartsUnverified(result)).toBe(true);
  });

  it("evidence is never pre-verified (AI cannot verify)", () => {
    // No matter the input, initialStatus must never be 'verified'
    const result = validateEvidence(validTextEvidence());
    expect(result.initialStatus).not.toBe("verified");
  });
});

// ─── Valid inputs ─────────────────────────────────────────────────────────────

describe("valid evidence inputs", () => {
  it("returns valid for complete text evidence", () => {
    const result = validateEvidence(validTextEvidence());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("returns valid for complete attachment evidence", () => {
    const result = validateEvidence(validAttachmentEvidence());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("accepts different relatedEntityTypes", () => {
    const types = ["action", "recommendation", "diagnosis", "benefit", "outcome"] as const;
    for (const t of types) {
      const result = validateEvidence(validTextEvidence({ relatedEntityType: t }));
      expect(result.valid).toBe(true);
    }
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => validateEvidence(validTextEvidence({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => validateEvidence(validTextEvidence({ workspaceId: "   " }))).toThrow();
  });
});
