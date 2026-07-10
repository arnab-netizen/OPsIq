import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError, NotFoundError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
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
    throw new NotFoundError("Workspace", input.workspaceSlug);
  }

  // Authorization: only an ACTIVE workspace admin may invite members / assign roles. Narrow select to
  // the two fields the policy consumes (drift-safe). Centralized fail-closed check (governed 403).
  const userRole = await db.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: session.user.id,
      },
    },
    select: { role: true, isActive: true },
  });

  assertCanInviteMembers(userRole);

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
            id: randomUUID(),
            email: member.email,
            name: member.email.split("@")[0],
            updatedAt: new Date(),
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
