/**
 * Input-guidance SERVICE — binds the pure dynamic guidance layer to real, workspace+business-scoped
 * rows. Reuses the SAME row→profile→category mapping as onboarding (one source of truth). Read-only.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prefetchOwnerDomainRows } from "@/services/owner-mode/owner-db-providers";
import {
  mapBusinessTypeToProfile,
  mapOperatingModelToRole,
  rowsToSuppliedCategories,
} from "@/services/owner-mode/owner-onboarding.service";
import { buildInputGuidance, type InputGuidance } from "@/domain/owner-mode/input-guidance";

export interface OwnerInputGuidanceDeps {
  db: PrismaClient;
  workspaceId: string;
  businessId: string;
  now: Date;
  freshnessDays?: number;
}

export interface OwnerInputGuidanceResult extends InputGuidance {
  workspaceId: string;
  businessId: string;
  found: boolean;
  generatedFromRuntime: true;
}

export async function getOwnerInputGuidance(deps: OwnerInputGuidanceDeps): Promise<OwnerInputGuidanceResult> {
  const { workspaceId, businessId } = deps;
  const rows = await prefetchOwnerDomainRows(deps);
  const business = rows.business as { businessType?: string; operatingModel?: string | null } | null;

  const profileType = mapBusinessTypeToProfile(business?.businessType);
  // Multi-location is an owner-role signal derived from operatingModel text only, never from archetype.
  const ownerRole = mapOperatingModelToRole(business?.operatingModel, false);
  const suppliedCategories = rowsToSuppliedCategories(rows);

  const guidance = buildInputGuidance({ profileType, ownerRole, suppliedCategories });
  return { ...guidance, workspaceId, businessId, found: Boolean(business), generatedFromRuntime: true };
}
