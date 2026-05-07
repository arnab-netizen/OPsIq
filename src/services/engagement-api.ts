/**
 * CRITICAL SERVICE API: Engagement Management
 *
 * Phase 0 contract: All mutations return ServiceResult<T> with canonical errors.
 * Deterministic output, audit metadata, policy enforcement, idempotency preservation.
 */

import type { ServiceResult } from "@/contracts";
import type { AuthContext } from "@/lib/auth-guard";
import {
  createEngagement as createEngagementInternal,
  updateEngagement as updateEngagementInternal,
  getEngagementById as getEngagementByIdInternal,
  type CreateEngagementInput,
  type UpdateEngagementInput,
} from "./engagement";
import {
  wrapServiceCall,
} from "./service-result-helper";

export interface EngagementDTO {
  id: string;
  code: string;
  title: string;
  clientId: string;
  workspaceId: string;
  status: string;
  serviceTier: string;
  engagementMode: string;
  interventionMode: string;
  description?: string | null;
  startDate?: Date | null;
  targetEndDate?: Date | null;
  ownerId?: string | null;
  assignedConsultantId?: string | null;
  healthStatus?: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create engagement with deterministic ServiceResult<T> contract.
 * Enforces:
 * - Canonical error types only (no raw thrown strings)
 * - Audit metadata preservation (executedAt, actorId, workspaceId)
 * - Policy/auth failures fail closed (POLICY_ERROR, AUTH_ERROR)
 */
export async function createEngagementAPI(
  input: CreateEngagementInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<ServiceResult<EngagementDTO>> {
  return wrapServiceCall(
    async () => {
      const result = await createEngagementInternal(
        input,
        authContext,
        workspaceId
      );

      // Fetch full engagement data (result.id from createEngagementInternal return value)
      const engagement = await getEngagementByIdInternal(result.id, workspaceId, true);
      if (!engagement) {
        throw new Error("Engagement not found after creation");
      }

      return {
        id: engagement.id,
        code: engagement.code,
        title: engagement.title,
        clientId: engagement.clientId,
        workspaceId: engagement.workspaceId,
        status: engagement.status ?? "active",
        serviceTier: engagement.serviceTier,
        engagementMode: engagement.engagementMode,
        interventionMode: engagement.interventionMode,
        description: engagement.description,
        startDate: engagement.startDate,
        targetEndDate: engagement.targetEndDate,
        ownerId: engagement.ownerId,
        assignedConsultantId: engagement.assignedConsultantId,
        healthStatus: engagement.healthStatus,
        version: engagement.version ?? 1,
        createdAt: engagement.createdAt,
        updatedAt: engagement.updatedAt,
      } as EngagementDTO;
    },
    {
      actorId: authContext.session.user.id,
      workspaceId,
    }
  );
}

/**
 * Update engagement with deterministic ServiceResult<T> contract.
 */
export async function updateEngagementAPI(
  engagementId: string,
  input: UpdateEngagementInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<ServiceResult<EngagementDTO>> {
  return wrapServiceCall(
    async () => {
      await updateEngagementInternal(
        engagementId,
        input,
        authContext,
        workspaceId
      );

      // Fetch updated engagement
      const result = await getEngagementByIdInternal(engagementId, workspaceId, true);
      if (!result) {
        throw new Error(`Engagement not found after update: ${engagementId}`);
      }

      return {
        id: result.id,
        code: result.code,
        title: result.title,
        clientId: result.clientId,
        workspaceId: result.workspaceId,
        status: result.status ?? "active",
        serviceTier: result.serviceTier,
        engagementMode: result.engagementMode,
        interventionMode: result.interventionMode,
        description: result.description,
        startDate: result.startDate,
        targetEndDate: result.targetEndDate,
        ownerId: result.ownerId,
        assignedConsultantId: result.assignedConsultantId,
        healthStatus: result.healthStatus,
        version: result.version ?? 1,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      } as EngagementDTO;
    },
    {
      actorId: authContext.session.user.id,
      workspaceId,
    }
  );
}

/**
 * Get engagement by ID with deterministic ServiceResult<T> contract.
 */
export async function getEngagementAPI(
  engagementId: string,
  workspaceId: string
): Promise<ServiceResult<EngagementDTO>> {
  return wrapServiceCall(
    async () => {
      const result = await getEngagementByIdInternal(engagementId, workspaceId, true);
      if (!result) {
        throw new Error(`Engagement not found: ${engagementId}`);
      }

      return {
        id: result.id,
        code: result.code,
        title: result.title,
        clientId: result.clientId,
        workspaceId: result.workspaceId,
        status: result.status ?? "active",
        serviceTier: result.serviceTier,
        engagementMode: result.engagementMode,
        interventionMode: result.interventionMode,
        description: result.description,
        startDate: result.startDate,
        targetEndDate: result.targetEndDate,
        ownerId: result.ownerId,
        assignedConsultantId: result.assignedConsultantId,
        healthStatus: result.healthStatus,
        version: result.version ?? 1,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      } as EngagementDTO;
    },
    {
      workspaceId,
    }
  );
}
