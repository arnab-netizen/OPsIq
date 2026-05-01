import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  addMember,
  removeMember,
  getMembershipsForUser,
} from "@/services/engagement-membership";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { ROLES } from "@/domain/constants/roles";
import type { NextRequest } from "next/server";

const roleValues = Object.values(ROLES) as [string, ...string[]];

const addMemberSchema = z.object({
  engagementId: z.string().uuid(),
  role: z.enum(roleValues),
});

const removeMemberSchema = z.object({
  engagementId: z.string().uuid(),
  role: z.enum(roleValues),
});

export const GET = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  await withAuth({ capability: CAPABILITIES.USER_VIEW, internalOnly: true });

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

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const memberships = await getMembershipsForUser(userId);
  return Response.json({ memberships });
});

export const POST = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
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

  const membershipCheck = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membershipCheck) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, addMemberSchema);

  const result = await addMember(
    { userId, ...body } as Parameters<typeof addMember>[0],
    { session, policy }
  );

  return Response.json(result, { status: result.isNew ? 201 : 200 });
});

export const DELETE = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
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

  const membershipCheck = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membershipCheck) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await context.params;
  parseOrThrow(uuidSchema, userId);

  const body = await parseRequestBody(request, removeMemberSchema);

  await removeMember(
    { userId, ...body } as Parameters<typeof removeMember>[0],
    { session, policy }
  );

  return Response.json({ status: "removed" });
});
