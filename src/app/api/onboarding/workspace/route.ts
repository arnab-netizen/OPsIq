import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";
import { z } from "zod";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const body = await request.json();
  const input = CreateWorkspaceSchema.parse(body);

  // Check if slug already exists
  const existing = await db.workspace.findUnique({
    where: { slug: input.slug },
  });

  if (existing) {
    throw new Error("Workspace slug already exists");
  }

  // Create workspace and add creator as admin
  const workspace = await db.workspace.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      createdBy: session.user.id,
      memberships: {
        create: {
          userId: session.user.id,
          role: "admin",
          addedBy: session.user.id,
        },
      },
    },
  });

  return {
    workspaceId: workspace.id,
    slug: workspace.slug,
    message: "Workspace created successfully",
  };
});
