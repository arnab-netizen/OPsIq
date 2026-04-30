import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const input = InviteSchema.parse(body);

    // Get workspace
    const workspace = await db.workspace.findUnique({
      where: { slug: input.workspaceSlug },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
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
      return NextResponse.json(
        { error: "Not authorized to invite members" },
        { status: 403 }
      );
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

    return NextResponse.json(
      {
        workspaceId: workspace.id,
        invitations: results,
        message: `Invited ${results.length} member(s) to workspace`,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Invitation failed: ${message}`);

    return NextResponse.json(
      { error: "Failed to send invitations", details: message },
      { status: 500 }
    );
  }
}
