import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getInterventionState,
  updateInterventionPhase,
  updateInterventionMode,
} from "@/services/intervention-state";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { INTERVENTION_PHASES, INTERVENTION_MODES } from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const updateInterventionPhaseSchema = z.object({
  interventionPhase: z.enum(INTERVENTION_PHASES),
  version: z.number().int().min(1),
});

const updateInterventionModeSchema = z.object({
  interventionMode: z.enum(INTERVENTION_MODES),
  version: z.number().int().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {

    const workspaceId = ctx.verifiedWorkspaceId;
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const state = await getInterventionState(engagementId);
    return Response.json(state);
  },
  { requireCapabilities: ["INTERVENTION_VIEW"], requireWorkspace: true }
);

export const PATCH = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = ctx.verifiedWorkspaceId;
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  // Parse body and determine which field is being updated
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if ("interventionPhase" in body) {
    const validatedBody = updateInterventionPhaseSchema.parse(body);
    await updateInterventionPhase(engagementId, validatedBody, canonicalizeAuthContext({ session, policy }, workspaceId), workspaceId);
  } else if ("interventionMode" in body) {
    const validatedBody = updateInterventionModeSchema.parse(body);
    await updateInterventionMode(engagementId, validatedBody, canonicalizeAuthContext({ session, policy }, workspaceId), workspaceId);
  } else {
    return Response.json(
      {
        error: "Must provide either interventionPhase or interventionMode",
      },
      { status: 400 }
    );
  }

  const updated = await getInterventionState(engagementId, workspaceId);
  return Response.json(updated);
});
