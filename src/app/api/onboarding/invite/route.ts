import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";
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

type InviteInput = z.infer<typeof InviteSchema>;

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  if (!session?.user?.id) {
    throw new UnauthorizedError("Unauthorized");
  }

  const body = await request.json();
  const input = InviteSchema.parse(body);

  // Get workspace
  const workspace = await db.workspace.findUnique({
    where: { slug: input.workspaceSlug },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // Check user is admin of workspace
  const userRole = await db.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: session.user.id,
      },
    },
  });

  if (!userRole || (userRole.role !== "admin" && userRole.isActive === false)) {
    throw new Error("Not authorized to invite members");
  }

  // Process invitations (create or update users, add to workspace)
  const results = await Promise.all(
    input.members.map(async (member) => {
      // Find or create user
      let user = await db.user.findUnique({
        where: { email: member.email },
      });

      if (!user) {
        user = await db.user.create({
          data: {
            email: member.email,
            name: member.email.split("@")[0],
          },
        });
      }

      // Add to workspace (or update existing membership)
      try {
        await db.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: member.role,
            addedBy: session.user.id,
          },
        });
      } catch {
        // User already in workspace, try to update if inactive
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
});
