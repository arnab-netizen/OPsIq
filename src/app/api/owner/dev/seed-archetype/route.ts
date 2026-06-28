/**
 * Jarvis 360 owner-flow closure (EH-22) — dev/test-only archetype seed surface.
 *
 * POST /api/owner/dev/seed-archetype — seed the laundry archetype for the workspace.
 *   Dev/test only: returns 403 in production (assertSeedAllowed). OWNER_MANAGE + workspace.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { seedLaundryArchetype, SeedNotAllowedError } from "@/services/owner-mode/archetype-seed.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    try {
      const result = await seedLaundryArchetype({ workspaceId: ctx.verifiedWorkspaceId, actorId: ctx.verifiedActorId });
      return canonicalJson(result, { status: 201 });
    } catch (err) {
      if (err instanceof SeedNotAllowedError) {
        return canonicalJson({ error: "Seeding is disabled in production." }, { status: 403 });
      }
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
