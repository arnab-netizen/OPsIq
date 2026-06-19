import type { PrismaClient } from "@/generated/prisma/client";
import { assertWorkspaceScopedQuery } from "@/domain/owner-mode/security-rules";
import {
  EVIDENCE_ORIGIN_FORBIDDEN,
  ELIGIBILITY_ALLOWS_PROMOTION,
  type ControlledLearningEligibilityStatus,
} from "@/domain/owner-mode/controlled-learning";

// Evidence origin strings that are always forbidden regardless of candidate status.
// Includes the domain set plus "public_source_unverified" as an explicit string guard.
const ADMISSION_FORBIDDEN_ORIGINS = new Set([
  ...EVIDENCE_ORIGIN_FORBIDDEN,
  "public_source_unverified",
]);

// Minimum days that must have elapsed since the outcome was recorded before admission is allowed.
// This enforces server-side outcome window validation (HIGH-3) independently of caller input.
const OUTCOME_WINDOW_MIN_DAYS = 30;

export interface AdmitCandidateInput {
  workspaceId: string;
  candidateId: string;
  admittedBy: string;
  admittedAt: Date;
  sourceLabel: string;
  evidenceOrigin: string;
  // eligibilityStatus removed — must be read from DB, not accepted from caller
  admissionNotes: string;
}

export interface AdmitCandidateResult {
  admitted: boolean;
  violations: string[];
  admission?: object;
}

export async function admitCandidate(
  prisma: PrismaClient,
  input: AdmitCandidateInput
): Promise<AdmitCandidateResult> {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const {
    workspaceId,
    candidateId,
    admittedBy,
    admittedAt,
    sourceLabel,
    evidenceOrigin,
    admissionNotes,
  } = input;

  // Guard 0: admittedBy must be a non-empty, non-whitespace actor (SCENARIO-29)
  if (!admittedBy || !admittedBy.trim()) {
    return {
      admitted: false,
      violations: ["admittedBy is required and must be a non-empty actor identifier"],
    };
  }

  // Guard 1: forbidden evidence origins blocked before any DB access
  if (ADMISSION_FORBIDDEN_ORIGINS.has(evidenceOrigin)) {
    return {
      admitted: false,
      violations: [`Evidence origin "${evidenceOrigin}" is forbidden and may never be admitted`],
    };
  }

  // Guard 2: fetch candidate from DB — eligibilityStatus comes from DB only, never from caller
  const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
    where: { id: candidateId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      eligibilityStatus: true,
      evidenceSourceType: true,
      promotionLocked: true,
      outcomeRecordedAt: true,
    },
  });

  if (!candidate) {
    return { admitted: false, violations: ["Candidate not found or wrong workspace"] };
  }

  // Cross-workspace guard: DB record workspace must match request workspace
  if (candidate.workspaceId !== workspaceId) {
    return { admitted: false, violations: ["Cross-workspace admission attempt blocked"] };
  }

  // Guard 2b (HIGH-3): server-side outcome window enforcement — never trust caller-provided flag
  const outcomeRecordedAt: Date | null = candidate.outcomeRecordedAt ?? null;
  if (!outcomeRecordedAt) {
    try {
      await (prisma as any).controlledLearningCandidateAuditEntry.create({
        data: {
          workspaceId,
          candidateId,
          action: "ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP",
          actorId: admittedBy,
          detail: "Admission blocked: outcomeRecordedAt not set — cannot verify outcome window elapsed",
          timestamp: admittedAt,
        },
      });
    } catch (auditErr) {
      console.error("[audit] Failed to write admission-blocked-no-outcome-timestamp audit entry", { candidateId, workspaceId, auditErr });
    }
    return {
      admitted: false,
      violations: ["Outcome timestamp not recorded — outcome window cannot be verified server-side"],
    };
  }
  const daysSinceOutcome = (admittedAt.getTime() - outcomeRecordedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOutcome < OUTCOME_WINDOW_MIN_DAYS) {
    try {
      await (prisma as any).controlledLearningCandidateAuditEntry.create({
        data: {
          workspaceId,
          candidateId,
          action: "ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED",
          actorId: admittedBy,
          detail: `Admission blocked: outcome window requires ${OUTCOME_WINDOW_MIN_DAYS} days; only ${daysSinceOutcome.toFixed(1)} days elapsed since outcomeRecordedAt`,
          timestamp: admittedAt,
        },
      });
    } catch (auditErr) {
      console.error("[audit] Failed to write admission-blocked-outcome-window audit entry", { candidateId, workspaceId, auditErr });
    }
    return {
      admitted: false,
      violations: [`Outcome window not elapsed: ${OUTCOME_WINDOW_MIN_DAYS} days required, ${daysSinceOutcome.toFixed(1)} days elapsed`],
    };
  }

  // Guard 3: revalidate eligibility using stored DB status — caller-provided status is never used
  const dbEligibilityStatus = candidate.eligibilityStatus as ControlledLearningEligibilityStatus;
  const allowsPromotion = ELIGIBILITY_ALLOWS_PROMOTION[dbEligibilityStatus] ?? false;
  if (!allowsPromotion) {
    try {
      await (prisma as any).controlledLearningCandidateAuditEntry.create({
        data: {
          workspaceId,
          candidateId,
          action: "ADMISSION_BLOCKED_INELIGIBLE",
          actorId: admittedBy,
          detail: `Admission blocked: DB eligibilityStatus=${dbEligibilityStatus} does not allow admission`,
          timestamp: admittedAt,
        },
      });
    } catch (auditErr) {
      console.error("[audit] Failed to write admission-blocked-ineligible audit entry", { candidateId, workspaceId, auditErr });
    }
    return {
      admitted: false,
      violations: [
        `Candidate DB eligibility status does not allow admission: ${dbEligibilityStatus}`,
      ],
    };
  }

  // Guard 4: an APPROVED review must exist — cannot skip the review step
  const approvedReview = await (prisma as any).controlledLearningReview.findFirst({
    where: { candidateId, workspaceId, decision: "APPROVED" },
    select: { id: true },
  });
  if (!approvedReview) {
    try {
      await (prisma as any).controlledLearningCandidateAuditEntry.create({
        data: {
          workspaceId,
          candidateId,
          action: "ADMISSION_BLOCKED_NO_APPROVED_REVIEW",
          actorId: admittedBy,
          detail: "Admission blocked: no APPROVED review found for candidate",
          timestamp: admittedAt,
        },
      });
    } catch (auditErr) {
      console.error("[audit] Failed to write admission-blocked-no-review audit entry", { candidateId, workspaceId, auditErr });
    }
    return {
      admitted: false,
      violations: [
        "No APPROVED review found for candidate — a review must be completed and approved before admission",
      ],
    };
  }

  // Guard 5 (HIGH-6): block admission if a CRITICAL unmitigated harm event exists
  const criticalHarm = await (prisma as any).controlledLearningHarmEvent.findFirst({
    where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false },
    select: { id: true },
  });
  if (criticalHarm) {
    try {
      await (prisma as any).controlledLearningCandidateAuditEntry.create({
        data: {
          workspaceId,
          candidateId,
          action: "ADMISSION_BLOCKED_CRITICAL_HARM",
          actorId: admittedBy,
          detail: "Admission blocked: unmitigated CRITICAL harm event exists",
          timestamp: admittedAt,
        },
      });
    } catch (auditErr) {
      console.error("[audit] Failed to write admission-blocked-harm audit entry", { candidateId, workspaceId, auditErr });
    }
    return {
      admitted: false,
      violations: [
        "Candidate has an unmitigated CRITICAL harm event — admission blocked until harm is mitigated",
      ],
    };
  }

  // Guard 6: duplicate admission guard
  const existing = await (prisma as any).controlledLearningAdmission.findFirst({
    where: { workspaceId, candidateId },
    select: { id: true },
  });
  if (existing) {
    return { admitted: false, violations: ["Candidate already admitted"] };
  }

  // All guards passed — write admission using DB eligibilityStatus, not caller input
  const admission = await (prisma as any).controlledLearningAdmission.create({
    data: {
      workspaceId,
      candidateId,
      admittedBy,
      admittedAt,
      sourceLabel,
      evidenceOrigin,
      eligibilityStatus: dbEligibilityStatus, // authoritative value from DB
      admissionNotes,
    },
  });

  try {
    await (prisma as any).controlledLearningCandidateAuditEntry.create({
      data: {
        workspaceId,
        candidateId,
        action: "ADMISSION_CREATED",
        actorId: admittedBy,
        detail: `Candidate admitted: eligibilityStatus=${dbEligibilityStatus} sourceLabel=${sourceLabel} evidenceOrigin=${evidenceOrigin}`,
        timestamp: admittedAt,
      },
    });
  } catch (auditErr) {
    console.error("[audit] Failed to write admission audit entry", { candidateId, workspaceId, auditErr });
  }

  return { admitted: true, violations: [], admission };
}

export async function getAdmission(
  prisma: PrismaClient,
  workspaceId: string,
  candidateId: string
): Promise<object | null> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningAdmission.findFirst({
    where: { workspaceId, candidateId },
  });
}

export async function listAdmissionsForWorkspace(
  prisma: PrismaClient,
  workspaceId: string
): Promise<object[]> {
  assertWorkspaceScopedQuery({ workspaceId });
  return (prisma as any).controlledLearningAdmission.findMany({
    where: { workspaceId },
  });
}
