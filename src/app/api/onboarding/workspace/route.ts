import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";
import { z } from "zod";

const CreateWorkspaceSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const input = CreateWorkspaceSchema.parse(body);

    // Check if slug already exists
    const existing = await db.workspace.findUnique({
      where: { slug: input.slug },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Workspace slug already exists" },
        { status: 409 }
      );
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

    return NextResponse.json(
      {
        workspaceId: workspace.id,
        slug: workspace.slug,
        message: "Workspace created successfully",
      },
      { status: 201 }
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
    console.error(`Workspace creation failed: ${message}`);

    return NextResponse.json(
      { error: "Failed to create workspace", details: message },
      { status: 500 }
    );
  }
}
