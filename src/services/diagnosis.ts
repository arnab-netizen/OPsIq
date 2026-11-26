/**
 * Generic (consultant quick-intake) diagnosis — POST /api/diagnosis.
 *
 * A consultant enters a client's name, type, problem description, main concern and up to three
 * figures (monthly revenue, monthly costs, customers). This service:
 *  1. builds the evidence-grounded answer (src/domain/generic-diagnosis/answer.ts) — one main
 *     problem or an explicit "I can't determine that yet.", with provenance on every reason;
 *  2. records it as a governed consulting engagement through the canonical services
 *     (createClient / createEngagement / addMember — audit, plan entitlement, intervention state,
 *     re-evaluation), with the creator as a member so the engagement is reachable;
 *  3. persists only what the evidence supports: the submitted facts as evidence, a finding only
 *     when the figures prove one, and the answer's first/then steps as unvalidated proposals.
 *
 * It does not write a business-condition profile: the quick intake carries no evidence for the
 * human-factor or maturity dimensions that profile requires, and inventing them is not allowed.
 * The engagement starts with health "unknown" (createEngagement) until a consultant assesses it.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, ForbiddenError, PlanLimitError, ValidationError } from "@/infra/errors";
import { assertCapability } from "@/services/entitlement.service";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import { createClient } from "@/services/client-account";
import { createEngagement } from "@/services/engagement";
import { addMember } from "@/services/engagement-membership";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { getCapabilitiesForRole, hasCapability, highestRole } from "@/policies/capability-check";
import { isClientRole } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import type { InterventionMode } from "@/domain/constants/statuses";
import {
  buildGenericDiagnosisAnswer,
  GENERIC_DIAGNOSIS_MAIN_ISSUES,
  MAIN_ISSUE_LABEL,
  type GenericDiagnosisAnswer,
  type GenericDiagnosisInput,
  type Severity,
} from "@/domain/generic-diagnosis/answer";

export type BusinessProblemInput = GenericDiagnosisInput;

export interface DiagnosisResult {
  engagementId: string;
  engagementCode: string;
  createdAt: string;
  input: BusinessProblemInput;
  answer: GenericDiagnosisAnswer;
  /** Supporting detail for the engagement record — never the lead of the answer. */
  engagement: { interventionMode: InterventionMode; severity: Severity | null };
}

// ─── Validation ───────────────────────────────────────────────────────────

/** Upper bound on any figure (one trillion): larger values are typing errors, not a business. */
export const MAX_DIAGNOSIS_FIGURE = 1_000_000_000_000;

export function validateBusinessProblem(input: BusinessProblemInput): void {
  if (!input.businessName || input.businessName.trim().length === 0) {
    throw new ValidationError("businessName is required");
  }
  if (!input.businessType || input.businessType.trim().length === 0) {
    throw new ValidationError("businessType is required");
  }
  if (!input.problemStatement || input.problemStatement.trim().length === 0) {
    throw new ValidationError("problemStatement is required");
  }
  if (!(GENERIC_DIAGNOSIS_MAIN_ISSUES as readonly string[]).includes(input.mainIssue)) {
    throw new ValidationError(`mainIssue must be one of: ${GENERIC_DIAGNOSIS_MAIN_ISSUES.join(", ")}`);
  }
  for (const field of ["monthlyRevenue", "monthlyCosts", "customerCount"] as const) {
    const v = input[field];
    if (v === undefined) continue; // not entered = unknown (never coerced to 0)
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_DIAGNOSIS_FIGURE) {
      throw new ValidationError(`${field} must be a number from 0 to ${MAX_DIAGNOSIS_FIGURE.toLocaleString("en-US")} when provided`);
    }
  }
  if (input.customerCount !== undefined && !Number.isInteger(input.customerCount)) {
    throw new ValidationError("customerCount must be a whole number when provided");
  }
}

/**
 * Intervention mode for the engagement record, derived only from what the figures prove.
 * Undetermined evidence → "mixed" (no single mode is supported yet).
 */
export function interventionModeFor(answer: GenericDiagnosisAnswer): InterventionMode {
  if (answer.status === "concluded") {
    return answer.supporting.severity === "critical" ? "recovery" : "stabilization";
  }
  return "mixed";
}

// ─── Main ─────────────────────────────────────────────────────────────────

export async function diagnoseBusiness(
  input: BusinessProblemInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<DiagnosisResult> {
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
  enforceWorkspaceId(validatedWorkspaceId, "diagnoseBusiness", "diagnosis");
  validateBusinessProblem(input);

  // Plan entitlement first: nothing (not even the client) is written for a workspace whose plan
  // does not include engagements. createEngagement repeats this check; failing here avoids
  // leaving an orphan client behind on every refused attempt.
  const entitlement = await assertCapability(validatedWorkspaceId, "create_engagement");
  if (!entitlement.allowed) {
    throw new PlanLimitError("create_engagement", entitlement.reason || "Plan limit exceeded");
  }

  const answer = buildGenericDiagnosisAnswer(input);
  const interventionMode = interventionModeFor(answer);
  const severity = answer.supporting.severity;

  // Client: reuse this workspace's client of the same name, else create it (governed + audited).
  const existingClient = await db.clientAccount.findFirst({
    where: { name: input.businessName, workspaceId: validatedWorkspaceId },
    select: { id: true },
  });
  if (!existingClient && !(authContext.policy && hasCapability(authContext.policy, CAPABILITIES.CLIENT_CREATE))) {
    // Adding a client is its own protected action; quick diagnosis never bypasses it.
    throw new ForbiddenError(
      "CAPABILITY_NOT_GRANTED",
      "This business isn't a client yet, and adding a new client needs client-creation access. Ask an admin to add the client, then run the diagnosis again."
    );
  }
  const clientId = existingClient
    ? existingClient.id
    : (await createClient({ name: input.businessName, industry: input.businessType }, authContext, validatedWorkspaceId)).id;

  // Engagement via the canonical service (plan entitlement, audit, intervention state,
  // re-evaluation). The title is unique per run so a new diagnosis never merges into an old one.
  const runAt = new Date();
  const engagement = await createEngagement(
    {
      title: `${input.businessName} — quick diagnosis (${MAIN_ISSUE_LABEL[input.mainIssue]}) ${runAt.toISOString().slice(0, 23).replace("T", " ")} UTC`,
      clientId,
      serviceTier: "standard",
      engagementMode: "expert",
      interventionMode,
      description: input.problemStatement,
    },
    authContext,
    validatedWorkspaceId
  );

  // The consultant who ran the diagnosis must be able to open the engagement it created.
  await ensureCreatorMembership(engagement.id, actorId, validatedWorkspaceId, authContext);

  // Persist only supported records.
  const submittedEvidence = answer.evidence.filter((e) => e.provenance !== "calculated");
  const finding =
    answer.status === "concluded"
      ? {
          title: answer.mainProblem.headline,
          summary: [...answer.why.map((r) => r.text), answer.whatThisMeans].join(" "),
          severity: severity ?? "high",
        }
      : null;
  const steps = [answer.firstStep, ...answer.thenSteps];

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const evidenceRows = [];
    for (const item of submittedEvidence) {
      evidenceRows.push(
        await tx.evidence.create({
          data: {
            id: randomUUID(),
            engagementId: engagement.id,
            title: item.label,
            description: item.value,
            source: item.provenance, // "owner_input" | "owner_statement" — reported, not validated
            status: "identified",
            evidenceType: "quick_diagnosis_intake",
            submittedBy: actorId,
            collectedAt: runAt,
            metadata: { provenance: item.provenance, key: item.key, verified: false },
            updatedAt: runAt,
          },
        })
      );
    }

    let findingRow: { id: string } | null = null;
    if (finding) {
      // Primary evidence: the figures the finding is calculated from (costs, else revenue).
      const primary =
        evidenceRows[submittedEvidence.findIndex((e) => e.key === "monthlyCosts")] ??
        evidenceRows[submittedEvidence.findIndex((e) => e.key === "monthlyRevenue")];
      findingRow = await tx.finding.create({
        data: {
          id: randomUUID(),
          engagementId: engagement.id,
          title: finding.title,
          summary: finding.summary,
          primaryEvidenceId: primary.id,
          impactArea: "finance", // the gap may come from costs, revenue or both — not yet known
          severity: finding.severity,
          rootCause: null,
          updatedAt: runAt,
        },
      });
    }

    const recommendationRows = [];
    for (const step of steps) {
      recommendationRows.push(
        await tx.recommendation.create({
          data: {
            engagementId: engagement.id,
            findingId: findingRow?.id ?? null,
            priority: step === answer.firstStep ? "high" : "medium",
            title: step.title,
            description: step.why,
            estimatedImpact: null,
            workspaceId: validatedWorkspaceId,
            createdBy: actorId,
            // Unvalidated proposals: never born validated/owner-actionable (GAP-REC-01).
            isAiProposal: true,
            evidenceValidationScore: 0,
            reliabilityLevel: "low",
            kpiHealthScore: 0,
            kpiRiskLevel: "unknown",
            updatedAt: runAt,
          },
        })
      );
    }

    const actionRow = await tx.action.create({
      data: {
        id: randomUUID(),
        engagementId: engagement.id,
        recommendationId: recommendationRows[0].id,
        title: answer.firstStep.title,
        description: answer.firstStep.why,
        assignedTo: null,
        dueAt: null,
        status: "draft",
        updatedAt: runAt,
      },
    });

    return { evidenceRows, findingRow, recommendationRows, actionRow };
  });

  // Audit after commit (no side effects inside the transaction).
  for (let i = 0; i < created.evidenceRows.length; i++) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.EVIDENCE_SUBMITTED,
      actorId,
      entityType: "Evidence",
      entityId: created.evidenceRows[i].id,
      workspaceId: validatedWorkspaceId,
      payload: { engagementId: engagement.id, key: submittedEvidence[i].key, provenance: submittedEvidence[i].provenance },
      visibility: "internal",
    });
  }
  if (created.findingRow && finding) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.FINDING_CREATED,
      actorId,
      entityType: "Finding",
      entityId: created.findingRow.id,
      workspaceId: validatedWorkspaceId,
      payload: { engagementId: engagement.id, severity: finding.severity, title: finding.title },
    });
  }
  for (let i = 0; i < created.recommendationRows.length; i++) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
      actorId,
      entityType: "recommendation",
      entityId: created.recommendationRows[i].id,
      workspaceId: validatedWorkspaceId,
      payload: { engagementId: engagement.id, priority: i === 0 ? "high" : "medium", source: "quick_diagnosis" },
      visibility: "internal",
    });
  }
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_CREATED,
    actorId,
    entityType: "action",
    entityId: created.actionRow.id,
    workspaceId: validatedWorkspaceId,
    payload: { engagementId: engagement.id, priority: "high" },
    visibility: "internal",
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.DIAGNOSIS_COMPLETED,
    actorId,
    entityType: "Engagement",
    entityId: engagement.id,
    workspaceId: validatedWorkspaceId,
    payload: {
      mainIssue: input.mainIssue,
      status: answer.status,
      mainProblemCode: answer.mainProblem.code,
      certainty: answer.confidence.certainty.level,
      economics: answer.supporting.economics,
      severity,
      interventionMode,
      figuresProvided: answer.confidence.dataCompleteness.provided,
    },
  });

  // Mandatory adaptive rule: a finding proven from the figures is new critical evidence.
  if (created.findingRow && severity === "critical") {
    await triggerReEvaluation({
      changeType: "new_critical_evidence",
      entityType: "finding",
      entityId: created.findingRow.id,
      engagementId: engagement.id,
      workspaceId: validatedWorkspaceId,
      severity: "critical",
      description: answer.mainProblem.headline,
      triggeredBy: actorId,
    });
  }

  return {
    engagementId: engagement.id,
    engagementCode: engagement.code,
    createdAt: runAt.toISOString(),
    input,
    answer,
    engagement: { interventionMode, severity },
  };
}

async function ensureCreatorMembership(
  engagementId: string,
  actorId: string,
  workspaceId: string,
  authContext: CanonicalAuthContext
): Promise<void> {
  // Derive the membership role from the exact policy the request was authorized with — never a
  // fresh, wider role query — and only from roles that themselves grant ENGAGEMENT_CREATE under
  // this workspace's membership (so a self-serve owner's narrowed admin role, a client role or a
  // stray non-workspace assignment can never be written onto the engagement).
  const policy = authContext.policy;
  if (!policy) return; // no authorized policy → no membership is granted
  const eligible = policy.roles.filter(
    (r) =>
      r.scope === "workspace" &&
      r.scopeId === workspaceId &&
      !isClientRole(r.role) &&
      getCapabilitiesForRole(r.role, policy.workspaceRole).includes(CAPABILITIES.ENGAGEMENT_CREATE)
  );
  const role = highestRole({ ...policy, roles: eligible });
  if (!role) return;
  try {
    await addMember({ userId: actorId, engagementId, role, workspaceId }, authContext);
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e; // already a member
  }
}
