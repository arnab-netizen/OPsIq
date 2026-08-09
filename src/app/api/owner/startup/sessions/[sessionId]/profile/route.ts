/**
 * PATCH /api/owner/startup/sessions/[sessionId]/profile — versioned profile update.
 * GET   /api/owner/startup/sessions/[sessionId]/profile — get current profile version.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateContextProfile } from "@/services/owner-strategy/startup-session.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const session = await db.ownerStartupSession.findFirst({
      where: { id: params.sessionId, workspaceId: ctx.verifiedWorkspaceId },
      select: { currentProfileVersionId: true, profileVersion: true },
    });
    if (!session) throw new NotFoundError("OwnerStartupSession", params.sessionId);

    if (!session.currentProfileVersionId) {
      return canonicalJson({ profile: null, versionNumber: 0 }, { status: 200 });
    }

    const version = await db.startupContextProfileVersion.findFirst({
      where: { id: session.currentProfileVersionId!, workspaceId: ctx.verifiedWorkspaceId as string },
    });
    return canonicalJson({ profile: version, versionNumber: session.profileVersion }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const patchSchema = z.object({
  profileData: z.record(z.string(), z.unknown()),
  changeRationale: z.string().optional(),
  expectedVersion: z.number().int().optional(),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, patchSchema);
    const result = await updateContextProfile(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId,
      body.profileData,
      body.changeRationale,
      body.expectedVersion
    );
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
