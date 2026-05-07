/**
 * CRITICAL SERVICE API: Recommendation Management
 *
 * Phase 0 contract: All mutations return ServiceResult<T> with canonical errors.
 * Deterministic output, audit metadata, policy enforcement, idempotency preservation.
 */

import type { ServiceResult } from "@/contracts";
import type { AuthContext } from "@/lib/auth-guard";
import {
  createRecommendation as createRecommendationInternal,
  getRecommendationsForEngagement as getRecommendationsForEngagementInternal,
  type CreateRecommendationInput,
} from "./recommendation";
import {
  wrapServiceCall,
  createServiceResult,
  mapErrorToServiceError,
} from "./service-result-helper";

export interface RecommendationDTO {
  id: string;
  engagementId: string;
  findingId?: string | null;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  expectedImpact?: string | null;
  implementationPhase?: string | null;
  executionCertaintyScore?: number | null;
  version: number;
  createdAt: Date;
}

/**
 * Create recommendation with deterministic ServiceResult<T> contract.
 * Enforces:
 * - Canonical error types only (no raw thrown strings)
 * - Audit metadata preservation (executedAt, idempotencyKey, actorId, workspaceId)
 * - Policy/auth failures fail closed (POLICY_ERROR, AUTH_ERROR)
 * - Idempotency not bypassed (idempotencyKey propagated)
 */
export async function createRecommendationAPI(
  input: CreateRecommendationInput,
  authContext: AuthContext,
  workspaceId: string,
  idempotencyKey?: string
): Promise<ServiceResult<RecommendationDTO>> {
  return wrapServiceCall(
    async () => {
      const result = await createRecommendationInternal(
        input,
        authContext,
        workspaceId,
        idempotencyKey
      );

      return {
        id: result.id,
        engagementId: result.engagementId,
        findingId: result.findingId,
        title: result.title,
        description: result.description,
        priority: result.priority,
        status: result.status ?? "draft",
        expectedImpact: result.estimatedImpact,
        implementationPhase: result.implementationPhase,
        executionCertaintyScore: result.executionCertaintyScore,
        version: result.version ?? 1,
        createdAt: result.createdAt,
      } as RecommendationDTO;
    },
    {
      idempotencyKey,
      actorId: authContext.session.user.id,
      workspaceId,
    }
  );
}

/**
 * Get recommendations for engagement with deterministic ServiceResult<T> contract.
 */
export async function getRecommendationsForEngagementAPI(
  engagementId: string,
  userId: string,
  workspaceId: string
): Promise<ServiceResult<RecommendationDTO[]>> {
  return wrapServiceCall(
    async () => {
      const recommendations = await getRecommendationsForEngagementInternal(
        engagementId,
        userId,
        workspaceId
      );

      return recommendations.map((r: any) => ({
        id: r.id,
        engagementId: r.engagementId,
        findingId: r.findingId,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: r.status ?? "draft",
        expectedImpact: r.expectedImpact,
        implementationPhase: r.implementationPhase,
        executionCertaintyScore: r.executionCertaintyScore,
        version: r.version ?? 1,
        createdAt: r.createdAt,
      })) as RecommendationDTO[];
    },
    {
      actorId: userId,
      workspaceId,
    }
  );
}
