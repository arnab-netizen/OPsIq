import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
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

export const GET = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId);

  const state = await getInterventionState(engagementId);
  return Response.json(state);
});

export const PATCH = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId);

  // Parse body and determine which field is being updated
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if ("interventionPhase" in body) {
    const validatedBody = updateInterventionPhaseSchema.parse(body);
    await updateInterventionPhase(engagementId, validatedBody, { session, policy });
  } else if ("interventionMode" in body) {
    const validatedBody = updateInterventionModeSchema.parse(body);
    await updateInterventionMode(engagementId, validatedBody, { session, policy });
  } else {
    return Response.json(
      {
        error: "Must provide either interventionPhase or interventionMode",
      },
      { status: 400 }
    );
  }

  const updated = await getInterventionState(engagementId);
  return Response.json(updated);
});
