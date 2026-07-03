import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { ForbiddenError } from "@/infra/errors";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  getInterventionState,
  updateInterventionPhase,
  updateInterventionMode,
} from "@/services/intervention-state";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { INTERVENTION_PHASES, INTERVENTION_MODES } from "@/domain/constants/statuses";

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

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);
    const workspaceId = ctx.verifiedWorkspaceId;

    // Internal-only guard (defense-in-depth), preserving the legacy withAuth({ internalOnly: true }).
    // INTERVENTION_MANAGE is already restricted to internal roles by the capability mapping; the explicit
    // check is retained so a future capability regrant cannot silently expose intervention transitions to
    // client-side actors. `hasInternalAccess` is the centralized policy check.
    if (!ctx.policy || !hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required");
    }

    // Engagement-scoped access (fail-closed) — enforced before any mutation.
    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    // Parse body and determine which field is being updated.
    // NOTE: the canonical wrapper only honours a non-200 status when the handler THROWS an AppError
    // or returns a canonicalJson() envelope — a plain Response.json(..., { status }) is coerced to 200.
    // So client-error responses here use canonicalJson() to preserve the 400 contract.
    let body;
    try {
      body = await ctx.request!.json();
    } catch {
      return canonicalJson({ error: "Invalid JSON" }, { status: 400 });
    }

    if ("interventionPhase" in body) {
      const validatedBody = updateInterventionPhaseSchema.parse(body);
      await updateInterventionPhase(engagementId, validatedBody, ctx, workspaceId);
    } else if ("interventionMode" in body) {
      const validatedBody = updateInterventionModeSchema.parse(body);
      await updateInterventionMode(engagementId, validatedBody, ctx, workspaceId);
    } else {
      return canonicalJson(
        { error: "Must provide either interventionPhase or interventionMode" },
        { status: 400 }
      );
    }

    // Return the plain payload (the canonical wrapper serialises the handler's return value).
    return getInterventionState(engagementId, workspaceId);
  },
  { requireCapabilities: [CAPABILITIES.INTERVENTION_MANAGE], requireWorkspace: true }
);
