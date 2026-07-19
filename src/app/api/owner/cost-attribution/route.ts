/**
 * Phase 4 — Cost Attribution routes.
 *
 * POST /api/owner/cost-attribution — link a BudgetLine or SpendEntry to a BusinessObjective,
 *   or remove an existing attribution.
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  attributeBudgetLineToObjective,
  attributeSpendEntryToObjective,
  removeObjectiveAttribution,
} from "@/services/owner-mode/cost-attribution.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["ATTRIBUTE_BUDGET_LINE", "ATTRIBUTE_SPEND_ENTRY", "REMOVE_ATTRIBUTION"]),
  entityType: z.enum(["BudgetLine", "SpendEntry"]).optional(),
  entityId: z.string().trim().uuid(),
  objectiveId: z.string().trim().uuid().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "REMOVE_ATTRIBUTION") {
      if (!input.entityType) {
        return canonicalJson({ error: "entityType required for REMOVE_ATTRIBUTION" }, { status: 400 });
      }
      await removeObjectiveAttribution(workspaceId, actorId, input.entityType, input.entityId);
      return canonicalJson({ ok: true }, { status: 200 });
    }

    if (!input.objectiveId) {
      return canonicalJson({ error: "objectiveId required for attribution" }, { status: 400 });
    }

    if (input.action === "ATTRIBUTE_BUDGET_LINE") {
      const updated = await attributeBudgetLineToObjective(workspaceId, actorId, input.entityId, input.objectiveId);
      return canonicalJson({ updated }, { status: 200 });
    }

    // ATTRIBUTE_SPEND_ENTRY
    const updated = await attributeSpendEntryToObjective(workspaceId, actorId, input.entityId, input.objectiveId);
    return canonicalJson({ updated }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
