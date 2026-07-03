#!/usr/bin/env node
/**
 * Diagnostic Proof: Diagnosis Route Context Resolution
 *
 * Tests the same auth/context pipeline that POST /api/diagnosis uses. This route is gated by
 * canonical session enforcement (a signed-in actor with the ENGAGEMENT_CREATE capability in a
 * resolved workspace) — NOT by an x-opsiq-diagnostic-key. The handler runs only after that gate
 * passes, and every field it returns is scoped to the caller's own verified session/workspace.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Simulate the diagnosis route's context checks
    const sessionFound = !!ctx.session;
    const userFound = !!ctx.verifiedActorId;
    const verifiedWorkspaceIdPresent = !!ctx.verifiedWorkspaceId;
    const verifiedWorkspaceIdType = ctx.verifiedWorkspaceId ? typeof ctx.verifiedWorkspaceId : "missing";
    const verifiedWorkspaceIdLength = ctx.verifiedWorkspaceId ? String(ctx.verifiedWorkspaceId).length : 0;

    // Check membership count
    const { db } = await import("@/lib/db");
    const membershipCount = await db.workspaceMembership.count({
      where: { userId: ctx.verifiedActorId },
    });

    const activeWorkspaceMembership = await db.workspaceMembership.findFirst({
      where: {
        userId: ctx.verifiedActorId,
        isActive: true,
      },
      select: { workspaceId: true },
    });

    return {
      status: 200,
      body: {
        classification: "diagnosis_route_proof_complete",
        // Truthful gate description: reaching this handler means canonical session enforcement
        // (ENGAGEMENT_CREATE capability + resolved workspace) already passed. There is no
        // diagnostic-key check on this route, so we do not fabricate one.
        auth: {
          mechanism: "canonical_session_capability",
          requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
          requireWorkspace: true,
        },
        session: {
          sessionFound,
          userId: ctx.verifiedActorId?.substring(0, 4) + "...",
        },
        workspace: {
          verifiedWorkspaceIdPresent,
          verifiedWorkspaceIdType,
          verifiedWorkspaceIdLength,
          verifiedWorkspaceIdSample: ctx.verifiedWorkspaceId
            ? `${ctx.verifiedWorkspaceId.substring(0, 4)}...${ctx.verifiedWorkspaceId.substring(ctx.verifiedWorkspaceId.length - 4)}`
            : null,
        },
        membership: {
          totalMemberships: membershipCount,
          activeWorkspaceMembership: {
            found: !!activeWorkspaceMembership,
            workspaceIdMatches: activeWorkspaceMembership?.workspaceId === ctx.verifiedWorkspaceId,
          },
        },
        capabilities: {
          verifiedCapabilitiesPresent: ctx.verifiedCapabilities?.size ?? 0,
          hasEngagementCreate: ctx.verifiedCapabilities?.has(CAPABILITIES.ENGAGEMENT_CREATE) ?? false,
          allCapabilities: Array.from(ctx.verifiedCapabilities ?? []),
        },
        routeConfig: {
          requireWorkspace: true,
          requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
        },
        contextKeysPresent: {
          verifiedActorId: !!ctx.verifiedActorId,
          verifiedWorkspaceId: !!ctx.verifiedWorkspaceId,
          verifiedCapabilities: !!ctx.verifiedCapabilities,
          request: !!ctx.request,
          session: !!ctx.session,
          policy: !!ctx.policy,
        },
      },
    };
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
    requireWorkspace: true,
  }
);
