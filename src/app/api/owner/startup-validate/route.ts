/**
 * POST /api/owner/startup-validate — validate owner-supplied startup ideas
 *     (validation-first: shortlist, rejections with reasons, validation Work
 *     Package, kill/pivot criteria). Read-only analysis (no persistence).
 *     OWNER_VIEW, workspace-scoped, canonically enforced. Body validated via Zod.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { startupValidateRequestSchema } from "@/domain/owner-strategy/startup-mode.validation";
import { validateStartupSession } from "@/services/owner-strategy/startup.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const { intake, ideas } = await parseRequestBody(ctx.request!, startupValidateRequestSchema);
    return validateStartupSession(intake, ideas);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
