import { randomUUID } from "crypto";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError } from "@/infra/errors";
import { db } from "@/lib/db";
import { assertCanInviteMembers } from "@/services/auth/workspace-invite-policy";
import { z } from "zod";

const InviteSchema = z.object({
  workspaceSlug: z.string(),
  members: z.array(
    z.object({
      email: z.string().email(),
      role: z.enum(["admin", "approver", "submitter", "viewer"]),
    })
  ),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const actorId = ctx.verifiedActorId;

    const body = await ctx.request?.json();
    const input = InviteSchema.parse(body);

    const workspace = await db.workspace.findUnique({
      where: { slug: input.workspaceSlug },
    });

    if (!workspace) {
      throw new NotFoundError("Workspace", input.workspaceSlug);
    }

    const userRole = await db.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: actorId,
        },
      },
      select: { role: true, isActive: true },
    });

    assertCanInviteMembers(userRole);

    const results = await Promise.all(
      input.members.map(async (member) => {
        let user = await db.user.findUnique({
          where: { email: member.email },
        });

        if (!user) {
          user = await db.user.create({
            data: {
              id: randomUUID(),
              email: member.email,
              name: member.email.split("@")[0],
              updatedAt: new Date(),
            },
          });
        }

        try {
          await db.workspaceMembership.create({
            data: {
              workspaceId: workspace.id,
              userId: user.id,
              role: member.role,
              addedBy: actorId,
            },
          });
        } catch {
          await db.workspaceMembership.updateMany({
            where: {
              workspaceId: workspace.id,
              userId: user.id,
            },
            data: {
              role: member.role,
              isActive: true,
              removedAt: null,
            },
          });
        }

        return {
          email: member.email,
          success: true,
        };
      })
    );

    return {
      workspaceId: workspace.id,
      invitations: results,
      message: `Invited ${results.length} member(s) to workspace`,
    };
  }
);
