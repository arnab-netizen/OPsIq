import { assertWorkspaceScopedQuery } from "./security-rules";

export type EvidenceStatus =
  | "submitted"
  | "pending_verification"
  | "verified"
  | "rejected"
  | "conflicting"
  | "stale"
  | "insufficient";

export type EvidenceSourceType =
  | "owner_statement"
  | "document"
  | "photo"
  | "spreadsheet"
  | "system_export"
  | "third_party";

export type RelatedEntityType =
  | "action"
  | "recommendation"
  | "diagnosis"
  | "benefit"
  | "outcome";

export const EVIDENCE_STATUS_TRANSITIONS: Readonly<Record<EvidenceStatus, ReadonlyArray<EvidenceStatus>>> = {
  submitted: ["pending_verification", "rejected"],
  pending_verification: ["verified", "rejected", "conflicting", "insufficient"],
  verified: ["stale"],
  rejected: [],       // terminal
  conflicting: ["pending_verification", "rejected"],
  stale: ["pending_verification"],
  insufficient: ["submitted", "rejected"],
};

export interface EvidenceInput {
  workspaceId: string;
  businessId: string;
  relatedEntityType: RelatedEntityType;
  relatedEntityId: string;
  submittedBy: string;
  sourceType: EvidenceSourceType;
  evidenceText?: string;
  attachmentUrl?: string;
  originalFilename?: string;
  periodCovered?: string;
}

export interface EvidenceValidationResult {
  valid: boolean;
  violations: string[];
  initialStatus: EvidenceStatus;
}

export function isEvidenceStatusTransitionAllowed(
  from: EvidenceStatus,
  to: EvidenceStatus
): boolean {
  return (EVIDENCE_STATUS_TRANSITIONS[from] as ReadonlyArray<string>).includes(to);
}

export function validateEvidence(input: EvidenceInput): EvidenceValidationResult {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // EV-RULE-1: must have either evidenceText or attachmentUrl
  const hasText = input.evidenceText && input.evidenceText.trim().length >= 5;
  const hasAttachment = !!(input.attachmentUrl && input.attachmentUrl.trim().length > 0);
  if (!hasText && !hasAttachment) {
    violations.push("Evidence must include evidenceText (min 5 chars) or attachmentUrl (EV-RULE-1)");
  }

  // EV-RULE-2: submittedBy must be non-empty
  if (!input.submittedBy || input.submittedBy.trim().length === 0) {
    violations.push("submittedBy is required (EV-RULE-2)");
  }

  // EV-RULE-3: relatedEntityId must be non-empty
  if (!input.relatedEntityId || input.relatedEntityId.trim().length === 0) {
    violations.push("relatedEntityId is required (EV-RULE-3)");
  }

  // EV-RULE-4: attachment must have originalFilename when provided
  if (hasAttachment && !input.originalFilename) {
    violations.push("originalFilename required when attachmentUrl is provided (EV-RULE-4)");
  }

  return {
    valid: violations.length === 0,
    violations,
    // Evidence always starts as submitted — AI cannot pre-verify
    initialStatus: "submitted",
  };
}

export function evidenceStartsUnverified(result: EvidenceValidationResult): boolean {
  return result.initialStatus === "submitted";
}
