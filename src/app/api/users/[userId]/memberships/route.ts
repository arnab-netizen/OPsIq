import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  addMember,
  removeMember,
  getMembershipsForUser,
} from "@/services/engagement-membership";
import { parseRequestBody } from "@/lib/validation";
import { z } from "zod/v4";
import { ROLES } from "@/domain/constants/roles";

const roleValues = Object.values(ROLES) as [string, ...string[]];

const addMemberSchema = z.object({
  engagementId: z.string().uuid(),
  role: z.enum(roleValues),
});

const removeMemberSchema = z.object({
  engagementId: z.string().uuid(),
  role: z.enum(roleValues),
});

export const GET = withRequestContext(async (_request, context) => {
  const { userId } = await context.params;
  await withAuth({ capability: CAPABILITIES.USER_VIEW, internalOnly: true });

  const memberships = await getMembershipsForUser(userId);
  return Response.json({ memberships });
});

export const POST = withRequestContext(async (request, context) => {
  const { userId } = await context.params;
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, addMemberSchema);

  const result = await addMember(
    { userId, ...body } as Parameters<typeof addMember>[0],
    session.user.id
  );

  return Response.json(result, { status: result.isNew ? 201 : 200 });
});

export const DELETE = withRequestContext(async (request, context) => {
  const { userId } = await context.params;
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_MANAGE_MEMBERS,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, removeMemberSchema);

  await removeMember(
    { userId, ...body } as Parameters<typeof removeMember>[0],
    session.user.id
  );

  return Response.json({ status: "removed" });
});
