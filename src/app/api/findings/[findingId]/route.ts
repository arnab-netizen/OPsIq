import { withCanonicalEnforcement, type CanonicalAuthContext, type ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { hasInternalAccess } from "@/policies/capability-check";

import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getFindingDetail, updateFinding } from "@/services/findings";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import {
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_IMPACTS,
} from "@/domain/constants/statuses";


const updateFindingSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  severity: z.enum(FINDING_SEVERITIES).optional(),
  impactArea: z.enum(FINDING_IMPACTS).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  priorityScore: z.number().min(0).max(100).optional(),
  hypothesis: z.string().optional(),
  rootCause: z.string().optional(),
  consequence: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  version: z.number().int().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { findingId } = params;
    parseOrThrow(uuidSchema, findingId);

    const finding = await getFindingDetail(findingId, undefined, undefined, workspaceId);
    return finding;
  },
  { requireCapabilities: ["FINDING_VIEW"], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { findingId } = params;
    parseOrThrow(uuidSchema, findingId);

    const body = await parseRequestBody(ctx.request!, updateFindingSchema);

    // Create ServiceAuthEnvelope adapter from CanonicalAuthContext
    const authEnvelope: ServiceAuthEnvelope = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedActorType: ctx.verifiedActorType,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities,
      hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
      verifiedActor: ctx.verifiedActor,
      policy: ctx.policy,
    };

    await updateFinding(findingId, body, authEnvelope);

    const updated = await getFindingDetail(
      findingId,
      undefined,
      undefined,
      ctx.verifiedWorkspaceId
    );
    return updated;
  },
  {
    requireCapabilities: [CAPABILITIES.FINDING_UPDATE],
    requireWorkspace: true,
  }
);
