import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { db } from "@/lib/db";
import { z } from "zod";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const actorId = ctx.verifiedActorId;

    const body = await ctx.request?.json();
    const input = CreateWorkspaceSchema.parse(body);

    const existing = await db.workspace.findUnique({
      where: { slug: input.slug },
    });

    if (existing) {
      throw new Error("Workspace slug already exists");
    }

    const workspace = await db.workspace.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        createdBy: actorId,
        memberships: {
          create: {
            userId: actorId,
            role: "admin",
            addedBy: actorId,
          },
        },
      },
    });

    return {
      workspaceId: workspace.id,
      slug: workspace.slug,
      message: "Workspace created successfully",
    };
  }
);
