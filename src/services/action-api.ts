/**
 * CRITICAL SERVICE API: Action Management
 *
 * Phase 0 contract: All mutations return ServiceResult<T> with canonical errors.
 * Deterministic output, audit metadata, policy enforcement, idempotency preservation.
 */

import type { ServiceResult } from "@/contracts";
import type { AuthContext } from "@/lib/auth-guard";
import {
  createAction as createActionInternal,
  updateAction as updateActionInternal,
  getActionsForEngagement as getActionsForEngagementInternal,
  type CreateActionInput,
  type UpdateActionInput,
} from "./action";
import {
  wrapServiceCall,
  createServiceResult,
} from "./service-result-helper";

export interface ActionDTO {
  id: string;
  engagementId: string;
  recommendationId: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignedTo?: string | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
  verifiedAt?: Date | null;
  blockageReason?: string | null;
  notes?: string | null;
  version: number;
  createdAt: Date;
}

/**
 * Create action with deterministic ServiceResult<T> contract.
 * Enforces:
 * - Canonical error types only (no raw thrown strings)
 * - Audit metadata preservation (executedAt, idempotencyKey, actorId, workspaceId)
 * - Policy/auth failures fail closed (POLICY_ERROR, AUTH_ERROR)
 * - Idempotency not bypassed (idempotencyKey propagated)
 */
export async function createActionAPI(
  input: CreateActionInput,
  authContext: AuthContext,
  workspaceId: string,
  idempotencyKey?: string
): Promise<ServiceResult<ActionDTO>> {
  return wrapServiceCall(
    async () => {
      const result = await createActionInternal(
        input,
        authContext,
        workspaceId,
        idempotencyKey
      );

      return {
        id: result.id,
        engagementId: result.engagementId,
        recommendationId: result.recommendationId,
        title: result.title,
        description: result.description,
        status: result.status ?? "draft",
        priority: result.priority ?? "medium",
        assignedTo: result.assignedTo,
        dueDate: result.dueDate,
        completedAt: result.completedAt,
        verifiedAt: result.verifiedAt,
        blockageReason: result.blockageReason,
        notes: result.notes,
        version: result.version ?? 1,
        createdAt: result.createdAt,
      } as ActionDTO;
    },
    {
      idempotencyKey,
      actorId: authContext.session.user.id,
      workspaceId,
    }
  );
}

/**
 * Update action with deterministic ServiceResult<T> contract.
 */
export async function updateActionAPI(
  actionId: string,
  input: UpdateActionInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<ServiceResult<ActionDTO>> {
  return wrapServiceCall(
    async () => {
      const result = await updateActionInternal(
        actionId,
        input,
        authContext,
        workspaceId
      );

      return {
        id: result.id,
        engagementId: result.engagementId,
        recommendationId: result.recommendationId,
        title: result.title,
        description: result.description,
        status: result.status ?? "draft",
        priority: result.priority ?? "medium",
        assignedTo: result.assignedTo,
        dueDate: result.dueDate,
        completedAt: result.completedAt,
        verifiedAt: result.verifiedAt,
        blockageReason: result.blockageReason,
        notes: result.notes,
        version: result.version ?? 1,
        createdAt: result.createdAt,
      } as ActionDTO;
    },
    {
      actorId: authContext.session.user.id,
      workspaceId,
    }
  );
}

/**
 * Get actions for engagement with deterministic ServiceResult<T> contract.
 */
export async function getActionsForEngagementAPI(
  engagementId: string,
  userId: string,
  workspaceId: string
): Promise<ServiceResult<ActionDTO[]>> {
  return wrapServiceCall(
    async () => {
      const actions = await getActionsForEngagementInternal(
        engagementId,
        userId,
        workspaceId
      );

      return actions.map((a: any) => ({
        id: a.id,
        engagementId: a.engagementId,
        recommendationId: a.recommendationId,
        title: a.title,
        description: a.description,
        status: a.status ?? "draft",
        priority: a.priority ?? "medium",
        assignedTo: a.assignedTo,
        dueDate: a.dueDate,
        completedAt: a.completedAt,
        verifiedAt: a.verifiedAt,
        blockageReason: a.blockageReason,
        notes: a.notes,
        version: a.version ?? 1,
        createdAt: a.createdAt,
      })) as ActionDTO[];
    },
    {
      actorId: userId,
      workspaceId,
    }
  );
}
