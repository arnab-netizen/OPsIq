/**
 * POST /api/owner/startup/sessions/[sessionId]/generate-ideas
 * NEED_OPTIONS path: generate startup idea concepts from the session profile.
 * Returns NEED_OPTIONS_PRODUCTION_PROVIDER_UNAVAILABLE classification when
 * IDEA_GENERATION_PROVIDER env is not set.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateIdeasForNeedOptionsPath } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.object({
  availableCapitalCents: z.coerce.number().optional(),
  ownerSkills: z.array(z.string()).optional(),
  ownerTimeHoursPerWeek: z.coerce.number().optional(),
  geography: z.string().optional(),
  industries: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);

    const result = await generateIdeasForNeedOptionsPath(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      ctx.verifiedActorId,
      {
        capitalAvailableCents: body.availableCapitalCents ? BigInt(Math.round(body.availableCapitalCents)) : null,
        ownerSkills: body.ownerSkills ?? [],
        ownerHoursPerWeek: body.ownerTimeHoursPerWeek ?? null,
        geography: body.geography ?? null,
        preferredIndustries: body.industries ?? [],
        excludedCategories: body.constraints ?? [],
        riskTolerance: null,
        previouslyRejectedIdeaNames: [],
        existingAssets: [],
        existingCustomerProblems: [],
      }
    );

    // Explicit provider boundary classification — never silently classify as owner work
    const providerStatus = result.available
      ? "NEED_OPTIONS_PROVIDER_AVAILABLE"
      : "NEED_OPTIONS_PRODUCTION_PROVIDER_UNAVAILABLE";

    return canonicalJson(
      {
        providerStatus,
        available: result.available,
        generationMethod: result.generationMethod,
        concepts: result.concepts,
        providerNote: result.available
          ? null
          : "IDEA_GENERATION_PROVIDER env not configured — generation requires owner-provided concepts or a configured provider",
      },
      { status: 200 }
    );
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
