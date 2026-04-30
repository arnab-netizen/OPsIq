import { db } from "@/lib/db";
import { getSession } from "@/services/auth";

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role: "admin" | "approver" | "submitter" | "viewer";
  workspace: {
    name: string;
    slug: string;
  };
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error("Authentication required");
  }

  const userId = session.user.id;

  // Get user's workspace membership (assuming single workspace per session for now)
  const membership = await db.workspaceMembership.findFirst({
    where: {
      userId,
      isActive: true,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error("No active workspace membership");
  }

  return {
    workspaceId: membership.workspace.id,
    userId,
    role: membership.role as any,
    workspace: {
      name: membership.workspace.name,
      slug: membership.workspace.slug,
    },
  };
}

export async function getUserWorkspaceRole(
  userId: string,
  workspaceId: string
): Promise<string | null> {
  const membership = await db.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  return membership?.isActive ? membership.role : null;
}

export async function canUserAction(
  userId: string,
  workspaceId: string,
  action: "create" | "approve" | "override" | "reject" | "view"
): Promise<boolean> {
  const role = await getUserWorkspaceRole(userId, workspaceId);

  if (!role) return false;

  const rolePermissions: Record<string, string[]> = {
    admin: ["create", "approve", "override", "reject", "view"],
    approver: ["approve", "override", "reject", "view"],
    submitter: ["create", "view"],
    viewer: ["view"],
  };

  return rolePermissions[role]?.includes(action) ?? false;
}
