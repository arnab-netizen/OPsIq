/**
 * Business Profile Store
 *
 * Manages workspace-specific business context (industry, revenue, geography, costs).
 * Enforces workspace isolation - no global profiles, workspace context required.
 */

import { db } from "@/lib/db";

export interface BusinessProfileData {
  workspaceId: string;
  industry: string;
  revenueBand: string;
  geography: string;
  costStructure: Record<string, unknown>;
}

/**
 * Get business profile for workspace.
 * Fail-closed: requires workspace context.
 */
export async function getBusinessProfile(workspaceId: string) {
  if (!workspaceId) {
    throw new Error("Workspace context required for business profile");
  }

  return await db.businessProfile.findFirst({
    where: { workspaceId },
  });
}

/**
 * Create or update business profile for workspace.
 * Upsert: creates if not exists, updates if exists.
 * Workspace context required (fail-closed).
 */
export async function upsertBusinessProfile(data: BusinessProfileData) {
  if (!data.workspaceId) {
    throw new Error("Workspace context required for business profile");
  }

  // Validate required fields
  if (!data.industry || !data.revenueBand || !data.geography) {
    throw new Error("Industry, revenueBand, and geography are required");
  }

  // Validate costStructure is an object
  if (!data.costStructure || typeof data.costStructure !== "object") {
    throw new Error("costStructure must be a valid object");
  }

  return await db.businessProfile.upsert({
    where: { workspaceId: data.workspaceId },
    update: {
      industry: data.industry,
      revenueBand: data.revenueBand,
      geography: data.geography,
      costStructure: data.costStructure,
    },
    create: {
      workspaceId: data.workspaceId,
      industry: data.industry,
      revenueBand: data.revenueBand,
      geography: data.geography,
      costStructure: data.costStructure,
    },
  });
}

/**
 * Delete business profile for workspace.
 * Used for cleanup when workspace is deleted.
 */
export async function deleteBusinessProfile(workspaceId: string) {
  if (!workspaceId) {
    throw new Error("Workspace context required for business profile");
  }

  return await db.businessProfile.deleteMany({
    where: { workspaceId },
  });
}

/**
 * Check if workspace has a business profile.
 */
export async function hasBusinessProfile(workspaceId: string): Promise<boolean> {
  if (!workspaceId) {
    throw new Error("Workspace context required for business profile");
  }

  const profile = await db.businessProfile.findFirst({
    where: { workspaceId },
    select: { id: true }, // Only select ID for efficiency
  });

  return !!profile;
}
