/**
 * Command-center PRIORITIES service — assembles the top-priority strip from the LIVE runtime: the
 * whole-business plan, the readiness score, the action assignment, and the input guidance. Read-only.
 * No static fallback — an absent runtime plan yields an empty strip.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import { getOwnerReadiness } from "@/services/owner-mode/owner-readiness.service";
import { getOwnerActionAssignment } from "@/services/owner-mode/owner-action-assignment.service";
import { getOwnerInputGuidance } from "@/services/owner-mode/owner-input-guidance.service";
import { buildPriorityCommandStrip, type PriorityCard } from "@/domain/owner-mode/command-center-priorities";

export interface OwnerCommandPrioritiesDeps {
  db: PrismaClient;
  workspaceId: string;
  businessId: string;
  now: Date;
  freshnessDays?: number;
}

export interface OwnerCommandPrioritiesResult {
  workspaceId: string;
  businessId: string;
  found: boolean;
  generatedFromRuntime: true;
  cards: PriorityCard[];
}

export async function getOwnerCommandPriorities(deps: OwnerCommandPrioritiesDeps): Promise<OwnerCommandPrioritiesResult> {
  const { workspaceId, businessId } = deps;
  const [wbp, readiness, action, guidance] = await Promise.all([
    getOwnerWholeBusinessPlan(deps),
    getOwnerReadiness(deps),
    getOwnerActionAssignment(deps),
    getOwnerInputGuidance(deps),
  ]);

  const cards = buildPriorityCommandStrip({
    wbp: {
      found: wbp.found,
      topPriorityLabel: wbp.topPriority.label,
      dominantConstraint: wbp.dominantConstraint,
      nextBestAction: wbp.nextBestAction,
      doNotDo: wbp.doNotDo,
      proofRequired: wbp.proofRequired,
      reassessmentTriggers: wbp.reassessmentTriggers,
      redDomains: wbp.redDomains,
      ownerOffload: wbp.ownerWorkload.offload,
      overallConfidence: wbp.data.overallConfidence,
      approvalRequired: wbp.ownerWorkload.approvalRequired,
    },
    readiness: readiness.found ? { blockers: readiness.blockers, overallScore: readiness.overallScore } : null,
    action: action.found && action.assignment ? { responsibleParty: action.assignment.responsibleParty, proofType: action.assignment.proofType, escalationTrigger: action.assignment.escalationTrigger } : null,
    guidance: guidance.found ? { nextBestInput: guidance.nextBestInput, canProceedWithStrongRecommendation: guidance.canProceedWithStrongRecommendation } : null,
  });

  return { workspaceId, businessId, found: wbp.found, generatedFromRuntime: true, cards };
}
