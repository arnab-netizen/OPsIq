import { assertWorkspaceScopedQuery } from "./security-rules";

export type EvidenceVerificationStatus =
  | "verified"
  | "rejected"
  | "insufficient"
  | "conflicting"
  | "stale"
  | "needs_more_evidence";

export type VerifierType =
  | "owner"
  | "system"
  | "admin"
  | "external_record"
  | "test_fixture";

export type VerificationMethod =
  | "manual_review"
  | "cross_reference"
  | "system_audit"
  | "external_validation";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

// AI is never a verifier — this is a hard architectural invariant
export const AI_IS_NOT_A_VERIFIER = true;
export const AI_VERIFIER_TYPES: VerifierType[] = [];

// Owner statement alone does not constitute a verified record
export const OWNER_OPINION_ONLY_SOURCE_TYPES = ["owner_statement"] as const;

export const EVIDENCE_VERIFICATION_STATUS_TRANSITIONS: Readonly<
  Record<EvidenceVerificationStatus, ReadonlyArray<EvidenceVerificationStatus>>
> = {
  needs_more_evidence: ["verified", "rejected", "insufficient", "conflicting"],
  insufficient: ["verified", "rejected", "needs_more_evidence", "conflicting"],
  conflicting: ["verified", "rejected", "needs_more_evidence", "insufficient"],
  stale: ["needs_more_evidence", "verified", "rejected"],
  verified: ["stale", "conflicting"],
  rejected: [], // terminal
};

export function isVerificationStatusTransitionAllowed(
  from: EvidenceVerificationStatus,
  to: EvidenceVerificationStatus
): boolean {
  return (EVIDENCE_VERIFICATION_STATUS_TRANSITIONS[from] as ReadonlyArray<string>).includes(to);
}

export interface EvidenceVerificationInput {
  workspaceId: string;
  businessId: string;
  evidenceId: string;
  verifierType: VerifierType;
  verificationMethod: VerificationMethod;
  verificationReason: string;
  sourceType?: string;
  confidenceLevel?: ConfidenceLevel;
  conflictNotes?: string;
  hasCorroboratingSource?: boolean;
  conflictsWithOtherEvidence?: boolean;
  evidenceIsOutdated?: boolean;
}

export interface EvidenceVerificationResult {
  valid: boolean;
  violations: string[];
  verificationStatus: EvidenceVerificationStatus;
  confidenceLevel: ConfidenceLevel;
  ownerOpinionOnly: boolean;
  allowsLearning: boolean;
  blocksHighConfidence: boolean;
}

// EVVER-RULE-1: verificationReason must be non-trivial
const MIN_REASON_LENGTH = 10;

// EVVER-RULE-2: conflicting evidence requires conflictNotes
// EVVER-RULE-3: owner statement alone is opinion, not verified record
// EVVER-RULE-4: conflicting evidence blocks high confidence
// EVVER-RULE-5: evidenceId must be present
// EVVER-RULE-6: stale evidence cannot be verified

export function validateEvidenceVerification(
  input: EvidenceVerificationInput
): EvidenceVerificationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // EVVER-RULE-1: reason must be substantive
  if (!input.verificationReason || input.verificationReason.trim().length < MIN_REASON_LENGTH) {
    violations.push(
      `verificationReason must be at least ${MIN_REASON_LENGTH} characters (EVVER-RULE-1)`
    );
  }

  // EVVER-RULE-2: conflicting evidence requires notes
  if (input.conflictsWithOtherEvidence && !input.conflictNotes?.trim()) {
    violations.push(
      "conflictNotes required when conflictsWithOtherEvidence is true (EVVER-RULE-2)"
    );
  }

  // EVVER-RULE-5: evidenceId required
  if (!input.evidenceId || input.evidenceId.trim().length === 0) {
    violations.push("evidenceId is required (EVVER-RULE-5)");
  }

  const ownerOpinionOnly =
    input.sourceType !== undefined &&
    (OWNER_OPINION_ONLY_SOURCE_TYPES as readonly string[]).includes(input.sourceType) &&
    !input.hasCorroboratingSource;

  const blocksHighConfidence =
    !!input.conflictsWithOtherEvidence || !!input.evidenceIsOutdated || ownerOpinionOnly;

  let verificationStatus: EvidenceVerificationStatus = "needs_more_evidence";

  if (violations.length === 0) {
    if (input.evidenceIsOutdated) {
      verificationStatus = "stale";
    } else if (input.conflictsWithOtherEvidence) {
      verificationStatus = "conflicting";
    } else if (ownerOpinionOnly) {
      verificationStatus = "insufficient";
    } else {
      verificationStatus = "verified";
    }
  }

  const resolvedConfidence = deriveConfidenceLevel(input, ownerOpinionOnly, blocksHighConfidence);

  const allowsLearning =
    violations.length === 0 &&
    verificationStatus === "verified" &&
    !ownerOpinionOnly &&
    !input.conflictsWithOtherEvidence;

  return {
    valid: violations.length === 0,
    violations,
    verificationStatus,
    confidenceLevel: resolvedConfidence,
    ownerOpinionOnly,
    allowsLearning,
    blocksHighConfidence,
  };
}

function deriveConfidenceLevel(
  input: EvidenceVerificationInput,
  ownerOpinionOnly: boolean,
  blocksHighConfidence: boolean
): ConfidenceLevel {
  if (input.conflictsWithOtherEvidence) return "none";
  if (input.evidenceIsOutdated) return "low";
  if (ownerOpinionOnly) return "low";
  if (blocksHighConfidence) return "low";
  if (input.confidenceLevel) return input.confidenceLevel;
  return "medium";
}

export function ownerStatementRequiresCorroboration(sourceType: string): boolean {
  return (OWNER_OPINION_ONLY_SOURCE_TYPES as readonly string[]).includes(sourceType);
}

export function verificationAllowsLearning(result: EvidenceVerificationResult): boolean {
  return result.allowsLearning;
}
