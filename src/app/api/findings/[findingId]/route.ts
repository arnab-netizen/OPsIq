import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getFindingDetail, updateFinding } from "@/services/findings";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import {
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_IMPACTS,
} from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

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

export const GET = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  await withAuth({ capability: CAPABILITIES.FINDING_VIEW });

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

  const { findingId } = await context.params;
  parseOrThrow(uuidSchema, findingId);

  const finding = await getFindingDetail(findingId, undefined, undefined, workspaceId);
  return Response.json(finding);
});

export const PATCH = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.FINDING_UPDATE,
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

  const { findingId } = await context.params;
  parseOrThrow(uuidSchema, findingId);

  const body = await parseRequestBody(request, updateFindingSchema);
  await updateFinding(findingId, body, { session, policy }, workspaceId);

  const updated = await getFindingDetail(findingId, undefined, undefined, workspaceId);
  return Response.json(updated);
});
