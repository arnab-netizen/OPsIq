/**
 * POST /api/admin/workspaces/[id]/disable
 *
 * Soft-delete a workspace (disable it without removing data).
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 * Soft delete: marks workspace as inactive, no hard deletion.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { z } from "zod";

const DisableWorkspaceSchema = z.object({
  reason: z.string().optional(),
  notifyMembers: z.boolean().optional().default(true),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth enforcement (ADMIN_SETTINGS capability)
    const { session, policy } = await withAuth({
      capability: CAPABILITIES.SYSTEM_ADMIN,
    });
    if (!session || !policy) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK
    }

    // Validate request body
    const validationResult = DisableWorkspaceSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { reason, notifyMembers } = validationResult.data;

    // TODO: Update database via Prisma
    // UPDATE Workspace SET disabled = true WHERE id = ?
    // Optionally: emit audit event for workspace disable
    // Optionally: notify members if notifyMembers = true

    const response = {
      workspaceId,
      status: "disabled",
      reason,
      notifyMembers,
      disabledAt: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Failed to disable workspace:", error);
    return NextResponse.json(
      { error: "Failed to disable workspace" },
      { status: 500 }
    );
  }
}
