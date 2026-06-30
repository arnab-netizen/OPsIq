/**
 * Owner Pilot READINESS service — assembles the readiness score from the LIVE runtime whole-business
 * plan plus the real, workspace+business-scoped supplied data, and the committed max-reliability
 * benchmark. Read-only. No static fallback: if the runtime plan is not found, readiness is not ready.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import {
  mapBusinessTypeToProfile,
  mapOperatingModelToRole,
  rowsToSuppliedCategories,
} from "@/services/owner-mode/owner-onboarding.service";
import { getOwnerWholeBusinessPlan } from "@/services/owner-mode/owner-whole-business-plan.service";
import {
  assessOwnerPilotReadiness,
  type OwnerPilotReadiness,
  type ReadinessRuntimeSummary,
} from "@/domain/owner-mode/readiness-score";

export interface OwnerReadinessDeps {
  db: PrismaClient;
  workspaceId: string;
  businessId: string;
  now: Date;
  freshnessDays?: number;
}

export interface OwnerReadinessResult extends OwnerPilotReadiness {
  workspaceId: string;
  businessId: string;
  found: boolean;
  generatedFromRuntime: true;
}

/**
 * The committed expert benchmark is the proof the max-reliability ratchet passed for this build.
 * Fail-closed: any read/parse problem ⇒ not green ⇒ readiness blocked.
 */
export function maxReliabilityGreenFromBenchmark(): boolean {
  try {
    const raw = readFileSync(resolve(process.cwd(), "OPSIQ_EXPERT_BENCHMARK.json"), "utf8");
    const b = JSON.parse(raw) as { unsafeOutputs?: number; genericAnswerFailsGreen?: boolean; businessMathGreen?: boolean };
    return b.unsafeOutputs === 0 && b.genericAnswerFailsGreen === true && b.businessMathGreen === true;
  } catch {
    return false;
  }
}

export async function getOwnerReadiness(deps: OwnerReadinessDeps): Promise<OwnerReadinessResult> {
  const { workspaceId, businessId } = deps;
  const rows = await prefetchOwnerDomainRows(deps);
  const business = rows.business as { businessType?: string; operatingModel?: string | null } | null;

  const profileType = mapBusinessTypeToProfile(business?.businessType);
  const ownerRole = mapOperatingModelToRole(business?.operatingModel, profileType === "multi_location_smb");
  const suppliedCategories = rowsToSuppliedCategories(rows);

  const wbp = await getOwnerWholeBusinessPlan(deps);

  const runtime: ReadinessRuntimeSummary = {
    nextBestActionPresent: wbp.found && typeof wbp.nextBestAction === "string" && wbp.nextBestAction.length > 0 && !/no business data/i.test(wbp.nextBestAction),
    ownerManualActionCount: wbp.proofRequired.length + (wbp.ownerWorkload.approvalRequired ? 1 : 0),
    delegatedWorkCount: wbp.ownerWorkload.delegatedWork.length,
    proofRequiredCount: wbp.proofRequired.length,
    redDomains: wbp.redDomains,
    learningApplied: wbp.learning.applied,
    realProviderBacked: wbp.data.criticalDomainsRealProviderBacked,
    runtimePathAvailable: wbp.found && wbp.generatedFromRuntime === true,
    maxReliabilityGreen: maxReliabilityGreenFromBenchmark(),
  };

  const assessment = assessOwnerPilotReadiness({ profileType, ownerRole, suppliedCategories, runtime });
  return { ...assessment, workspaceId, businessId, found: Boolean(business), generatedFromRuntime: true };
}
