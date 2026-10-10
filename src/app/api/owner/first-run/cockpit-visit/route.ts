/** POST /api/owner/first-run/cockpit-visit — funnel milestones: cockpit_reached (once) and returning_owner (once a day). */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { recordCockpitVisit } from "@/services/owner-first-run/first-run-actions.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    await recordCockpitVisit(ctx.verifiedWorkspaceId, ctx.verifiedActorId);
    return canonicalJson({ ok: true }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
