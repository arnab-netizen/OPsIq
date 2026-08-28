/**
 * POST /api/owner/startup/initiatives/[initiativeId]/close — F-STARTUP-OUTCOME-LOOP.
 * Closes a StartupInitiative's funded outcome: classifies the measured result
 * (SUCCESS/PARTIAL/FAILED/UNVERIFIED/CANCELLED/OVERRIDDEN/EXTERNAL_FACTOR) via
 * the same classifier action-link.service.ts already uses for OwnerBudgetAction
 * completions, transitions the PENDING FundedInitiativeOutcome row created at
 * blueprint time into that classification, and marks the initiative
 * COMPLETED/CANCELLED. Requires the initiative's session to have already been
 * handed off to a real OwnerBusiness.
 * body: { cancelled?, overridden?, externalFactor?, outcomeVerified, expectedImpact?,
 *         actualImpact?, expectedSpend?, actualSpend?, note? }
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { startupInitiativeCloseSchema } from "@/domain/owner-strategy/startup-mode.validation";
import { closeStartupInitiative } from "@/services/owner-strategy/startup-initiative-outcome.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    parseOrThrow(uuidSchema, params.initiativeId);
    const input = await parseRequestBody(ctx.request!, startupInitiativeCloseSchema);
    const result = await closeStartupInitiative(
      ctx.verifiedWorkspaceId,
      params.initiativeId,
      input,
      ctx.verifiedActorId
    );
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
