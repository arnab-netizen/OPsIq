/**
 * Startup Research Service (Phase 5).
 *
 * Manages the research plan lifecycle:
 * - Building the plan (what to acquire, how, in what priority)
 * - Recording research acquisition results
 * - Computing completeness reports
 * - Minimizing owner effort by flagging only what cannot be auto-acquired
 *
 * Workspace isolation enforced on all operations.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import {
  buildResearchPlan,
  buildResearchCompletenessReport,
} from "@/domain/owner-strategy/startup-research-planner";
import type { EvidenceDomain } from "@/domain/owner-strategy/startup-research-planner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchAcquisitionInput {
  researchPlanId: string;
  domain: string;
  sourceUrl?: string | null;
  sourceType: string;
  queryMethod: string;
  rawResult?: string | null;
  extractedFacts: Record<string, unknown>;
  geography: string;
  applicableDate: Date;
  reliabilityClassification: string;
  confidence: number;
  limitations?: string | null;
  stalesnessRuleDays: number;
  linkedAssumptions?: string[];
  linkedDecisions?: string[];
}

export interface CompletenessReport {
  overallCompleteness: number;
  criticalGaps: string[];
  canClassifyReady: boolean;
  acquiredDomains: string[];
  ownerAcceptedGaps: string[];
  domainSummaries: Array<{
    domain: string;
    acquired: boolean;
    materialGaps: string[];
    effectOnDecision: string;
  }>;
}

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Build the research plan for a session, identifying all 10 standard evidence domains.
 * Returns the plan ID.
 */
export async function buildResearchPlanForSession(
  workspaceId: string,
  sessionId: string,
  actorId: string
): Promise<string> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

  type ProfileData = {
    geography: string | null;
    industry: string | null;
    targetCustomer: string | null;
    requiresLicence: boolean;
    hasConnectors: boolean;
  };

  const profile = (session as unknown as { profileData: ProfileData | null }).profileData;

  const plan = buildResearchPlan({
    geography: profile?.geography ?? null,
    industry: profile?.industry ?? null,
    targetCustomer: profile?.targetCustomer ?? null,
    ideaNames: [],
    requiresLicence: profile?.requiresLicence ?? false,
    hasConnectors: profile?.hasConnectors ?? false,
  });

  const now = new Date();
  const planId = randomUUID();

  await db.startupResearchPlan.create({
    data: {
      id: planId,
      workspaceId,
      sessionId,
      evidenceDomains: plan.evidenceDomains as unknown as object,
      completenessReport: null,
      acquiredDomains: [] as unknown as object,
      materialGaps: [] as unknown as object,
      approvedByOwner: false,
      createdAt: now,
      updatedAt: now,
    },
  });

  await db.ownerStartupSession.update({
    where: { id: sessionId },
    data: { researchPlanId: planId, updatedAt: now },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_RESEARCH_PLAN_BUILT,
    entityType: "StartupResearchPlan",
    entityId: planId,
    payload: {
      sessionId,
      autoAcquireableCount: plan.autoAcquireable.length,
      requiresOwnerApprovalCount: plan.requiresOwnerApproval.length,
      humanOnlyCount: plan.humanOnly.length,
      minimizedOwnerTaskCount: plan.minimizedOwnerTasks.length,
    },
  });

  return planId;
}

/**
 * Record the result of a research acquisition attempt for a specific domain.
 * Marks the domain as acquired in the plan and updates the completeness report.
 */
export async function recordResearchResult(
  workspaceId: string,
  actorId: string,
  input: ResearchAcquisitionInput
): Promise<string> {
  const plan = await db.startupResearchPlan.findFirst({
    where: { id: input.researchPlanId, workspaceId },
  });
  if (!plan) throw new NotFoundError("StartupResearchPlan", input.researchPlanId);

  const acquisitionId = randomUUID();
  const now = new Date();

  await db.startupResearchAcquisition.create({
    data: {
      id: acquisitionId,
      workspaceId,
      researchPlanId: input.researchPlanId,
      domain: input.domain,
      sourceUrl: input.sourceUrl ?? null,
      sourceType: input.sourceType,
      queryMethod: input.queryMethod,
      rawResult: input.rawResult ?? null,
      extractedFacts: input.extractedFacts as unknown as object,
      retrievedAt: now,
      geography: input.geography,
      applicableDate: input.applicableDate,
      reliabilityClassification: input.reliabilityClassification,
      confidence: input.confidence,
      limitations: input.limitations ?? null,
      stalesnessRuleDays: input.stalesnessRuleDays,
      linkedAssumptions: (input.linkedAssumptions ?? []) as unknown as object,
      linkedDecisions: (input.linkedDecisions ?? []) as unknown as object,
      status: "ACQUIRED",
      createdAt: now,
      updatedAt: now,
    },
  });

  // Update the acquired domains list on the plan (append-only)
  const existingAcquired = (plan as unknown as { acquiredDomains: string[] }).acquiredDomains ?? [];
  const updatedAcquired = Array.from(new Set([...existingAcquired, input.domain]));

  await db.startupResearchPlan.update({
    where: { id: input.researchPlanId },
    data: {
      acquiredDomains: updatedAcquired as unknown as object,
      updatedAt: now,
    },
  });

  await emitAuditEvent({
    workspaceId,
    actorId,
    eventName: AUDIT_EVENTS.STARTUP_RESEARCH_ACQUIRED,
    entityType: "StartupResearchAcquisition",
    entityId: acquisitionId,
    payload: {
      researchPlanId: input.researchPlanId,
      domain: input.domain,
      confidence: input.confidence,
      reliabilityClassification: input.reliabilityClassification,
    },
  });

  return acquisitionId;
}

/**
 * Build and persist the research completeness report for a session.
 * Returns the computed completeness report.
 */
export async function buildResearchCompletenessReportForSession(
  workspaceId: string,
  sessionId: string,
  ownerAcceptedGapDomains: string[] = []
): Promise<CompletenessReport> {
  const plan = await db.startupResearchPlan.findFirst({
    where: { sessionId, workspaceId },
  });
  if (!plan) throw new NotFoundError("StartupResearchPlan (for session)", sessionId);

  const evidenceDomains = (plan as unknown as { evidenceDomains: EvidenceDomain[] }).evidenceDomains ?? [];
  const acquiredDomains: string[] = (plan as unknown as { acquiredDomains: string[] }).acquiredDomains ?? [];

  const acquiredSet = new Set(acquiredDomains);
  const ownerAcceptedSet = new Set(ownerAcceptedGapDomains);

  const report = buildResearchCompletenessReport(evidenceDomains, acquiredSet, ownerAcceptedSet);

  // Persist the completeness report back to the plan
  await db.startupResearchPlan.update({
    where: { id: plan.id },
    data: {
      completenessReport: report as unknown as object,
      materialGaps: report.criticalGaps as unknown as object,
      updatedAt: new Date(),
    },
  });

  return {
    overallCompleteness: report.overallCompleteness,
    criticalGaps: report.criticalGaps,
    canClassifyReady: report.canClassifyReady,
    acquiredDomains,
    ownerAcceptedGaps: report.ownerAcceptedGaps,
    domainSummaries: report.domains.map((d) => ({
      domain: d.domain,
      acquired: d.acquired,
      materialGaps: d.materialGaps,
      effectOnDecision: d.effectOnDecision,
    })),
  };
}

/**
 * Get the list of minimized owner tasks — only what cannot be auto-acquired.
 * Returns tasks sorted by estimated owner minutes ascending.
 */
export async function getMinimizedOwnerResearchTasks(
  workspaceId: string,
  sessionId: string
): Promise<
  Array<{
    domain: string;
    whyCannotAutoAcquire: string;
    exactOwnerAction: string;
    estimatedOwnerMinutes: number;
    expectedOutput: string;
    ownerApprovalRequired: boolean;
    costIfAny: string;
    completionCondition: string;
  }>
> {
  const session = await db.ownerStartupSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new NotFoundError("OwnerStartupSession", sessionId);

  type ProfileData = {
    geography: string | null;
    industry: string | null;
    targetCustomer: string | null;
    requiresLicence: boolean;
    hasConnectors: boolean;
  };
  const profile = (session as unknown as { profileData: ProfileData | null }).profileData;

  const plan = buildResearchPlan({
    geography: profile?.geography ?? null,
    industry: profile?.industry ?? null,
    targetCustomer: profile?.targetCustomer ?? null,
    ideaNames: [],
    requiresLicence: profile?.requiresLicence ?? false,
    hasConnectors: profile?.hasConnectors ?? false,
  });

  return plan.minimizedOwnerTasks.sort((a, b) => a.estimatedOwnerMinutes - b.estimatedOwnerMinutes);
}
