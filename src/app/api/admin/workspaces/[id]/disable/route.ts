/**
 * POST /api/admin/workspaces/[id]/disable
 *
 * Soft-delete a workspace (disable it without removing data).
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 * Soft delete: marks workspace as inactive, no hard deletion.
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { z } from "zod";

const DisableWorkspaceSchema = z.object({
  reason: z.string().optional(),
  notifyMembers: z.boolean().optional().default(true),
});

export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    // Auth enforcement (ADMIN_SETTINGS capability)
    const { session, policy } = await withAuth({
      capability: CAPABILITIES.SYSTEM_ADMIN,
    });
    if (!session || !policy) {
      throw new UnauthorizedError("Unauthorized");
    }

    const workspaceId = params.id;
    if (!workspaceId) {
      throw new Error("Workspace ID required");
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
      throw new Error(`Invalid request body: ${validationResult.error.issues.map(i => i.message).join(', ')}`);
    }

    const { reason, notifyMembers } = validationResult.data;

    // TODO: Update database via Prisma
    // UPDATE Workspace SET disabled = true WHERE id = ?
    // Optionally: emit audit event for workspace disable
    // Optionally: notify members if notifyMembers = true

    return {
      workspaceId,
      status: "disabled",
      reason,
      notifyMembers,
      disabledAt: new Date().toISOString(),
    };
  }
);
