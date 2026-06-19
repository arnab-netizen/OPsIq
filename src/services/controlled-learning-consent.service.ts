import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";

const VALID_CONSENT_SCOPES = ["WORKSPACE_ONLY", "ANONYMIZED_AGGREGATE", "NONE"] as const;
type ConsentScope = (typeof VALID_CONSENT_SCOPES)[number];

interface RecordConsentInput {
  workspaceId: string;
  candidateId: string;
  consentGiven: boolean;
  consentBy: string;
  consentAt: Date;
  consentScope: ConsentScope;
  consentNotes: string;
}

interface ConsentRecordResult {
  recorded: boolean;
  violations: string[];
  record?: object;
}

export async function recordConsent(
  prisma: PrismaClient,
  input: RecordConsentInput
): Promise<ConsentRecordResult> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const violations: string[] = [];

  if (!input.workspaceId) violations.push("workspaceId is required");
  if (!input.candidateId) violations.push("candidateId is required");
  if (!input.consentBy) violations.push("consentBy is required");
  if (typeof input.consentGiven !== "boolean") violations.push("consentGiven must be a boolean");
  if (!(VALID_CONSENT_SCOPES as readonly string[]).includes(input.consentScope)) {
    violations.push(
      `consentScope must be one of: ${VALID_CONSENT_SCOPES.join(", ")}`
    );
  }

  if (violations.length > 0) {
    return { recorded: false, violations };
  }

  // Verify candidate exists in workspace
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: input.candidateId, workspaceId: input.workspaceId },
  });

  if (!candidate) {
    return {
      recorded: false,
      violations: ["Candidate not found in workspace"],
    };
  }

  const record = await (prisma as any).controlledLearningConsentRecord.create({
    data: {
      workspaceId: input.workspaceId,
      candidateId: input.candidateId,
      consentGiven: input.consentGiven,
      consentBy: input.consentBy,
      consentAt: input.consentAt,
      consentScope: input.consentScope,
      consentNotes: input.consentNotes ?? "",
    },
  });

  return { recorded: true, violations: [], record };
}

export async function getLatestConsent(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object | null> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningConsentRecord.findFirst({
    where: { workspaceId, candidateId },
    orderBy: { consentAt: "desc" },
  });
}

export async function listConsentRecords(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningConsentRecord.findMany({
    where: { workspaceId, candidateId },
    orderBy: { consentAt: "desc" },
  });
}
