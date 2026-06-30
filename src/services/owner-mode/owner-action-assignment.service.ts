/**
 * Owner ACTION-ASSIGNMENT service — derives the structured assignment + proof framing for the LIVE
 * next best action from the runtime whole-business plan. Read-only. No static fallback.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import { mapBusinessTypeToProfile, mapOperatingModelToRole } from "@/services/owner-mode/owner-onboarding.service";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import {
  resolveActionAssignment,
  type ActionAssignment,
  type ActionKind,
  type RiskClass,
} from "@/domain/owner-mode/action-assignment";

export interface OwnerActionAssignmentDeps {
  db: PrismaClient;
  workspaceId: string;
  businessId: string;
  now: Date;
  freshnessDays?: number;
}

const CONSTRAINT_KIND: Record<string, { kind: ActionKind; risk: RiskClass }> = {
  compliance_block: { kind: "compliance_filing", risk: "critical" },
  proof_fraud_block: { kind: "quality_oversight", risk: "critical" },
  cash_survival: { kind: "financial_decision", risk: "critical" },
  below_margin: { kind: "financial_decision", risk: "high" },
  capacity_feasibility: { kind: "operations_task", risk: "medium" },
  customer_quality: { kind: "customer_followup", risk: "medium" },
  owner_workload: { kind: "scheduling", risk: "medium" },
  profitable_growth: { kind: "financial_decision", risk: "medium" },
  efficiency_scaling: { kind: "operations_task", risk: "medium" },
  optimization: { kind: "operations_task", risk: "low" },
};

export interface OwnerActionAssignmentResult {
  workspaceId: string;
  businessId: string;
  found: boolean;
  generatedFromRuntime: true;
  dominantConstraint: string;
  assignment: ActionAssignment | null;
  proofRequired: string[];
  reassessmentTriggers: string[];
  delegatedWork: string[];
}

export async function getOwnerActionAssignment(deps: OwnerActionAssignmentDeps): Promise<OwnerActionAssignmentResult> {
  const { workspaceId, businessId } = deps;
  const rows = await prefetchOwnerDomainRows(deps);
  const business = rows.business as { businessType?: string; operatingModel?: string | null } | null;

  const wbp = await getOwnerWholeBusinessPlan(deps);
  if (!wbp.found || !business) {
    return { workspaceId, businessId, found: false, generatedFromRuntime: true, dominantConstraint: wbp.dominantConstraint, assignment: null, proofRequired: [], reassessmentTriggers: [], delegatedWork: [] };
  }

  const profileType = mapBusinessTypeToProfile(business.businessType);
  const ownerRole = mapOperatingModelToRole(business.operatingModel, profileType === "multi_location_smb");
  const map = CONSTRAINT_KIND[wbp.dominantConstraint] ?? { kind: "financial_decision" as ActionKind, risk: "medium" as RiskClass };

  const assignment = resolveActionAssignment({
    actionTitle: wbp.nextBestAction,
    kind: map.kind,
    riskClass: map.risk,
    ownerRole,
    requiresOnSite: map.kind === "operations_task" || map.kind === "quality_oversight",
    constraintLabel: wbp.topPriority.label,
    dueInDays: map.risk === "critical" ? 1 : map.risk === "high" ? 2 : 3,
  });

  return {
    workspaceId,
    businessId,
    found: true,
    generatedFromRuntime: true,
    dominantConstraint: wbp.dominantConstraint,
    assignment,
    proofRequired: wbp.proofRequired,
    reassessmentTriggers: wbp.reassessmentTriggers,
    delegatedWork: wbp.ownerWorkload.delegatedWork,
  };
}
