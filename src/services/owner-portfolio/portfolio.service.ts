/**
 * Owner Multi-Business Portfolio Command Center (Module 9) — portfolio service.
 *
 * Read-only aggregation: reads every business in the workspace, resolves each
 * one's Owner Intelligence Spine `BusinessConditionProfile` via the proven
 * `getBusinessCondition` and its ONE canonical owner decision via `resolveOwnerHome` (plus its canonical stale domains), and feeds them
 * to the deterministic portfolio engine (which never re-elects a business's main target).
 * Owns no table and mutates nothing — workspace ownership is enforced by the
 * underlying condition reads.
 */
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { resolveOwnerHome } from "@/services/owner-home/home.service";
import { buildPortfolioView, type PortfolioBusinessInput, type PortfolioView } from "@/domain/owner-portfolio";

/**
 * Build the full portfolio view for a workspace. Resolves each business's
 * condition profile in parallel, then aggregates deterministically. Returns an
 * explicit empty view when the workspace has no businesses.
 */
export async function getPortfolio(workspaceId: string, opts: { now?: Date } = {}): Promise<PortfolioView> {
  // One read for the canonical business list (ownership-scoped to the workspace).
  const base = await getBusinessCondition(workspaceId);
  const businesses = base.businesses;

  if (businesses.length === 0) {
    return buildPortfolioView([], { now: opts.now });
  }

  const inputs: PortfolioBusinessInput[] = await Promise.all(
    businesses.map(async (b) => {
      const [condition, resolved] = await Promise.all([
        getBusinessCondition(workspaceId, b.id, { now: opts.now }),
        resolveOwnerHome(workspaceId, b.id, { now: opts.now }),
      ]);
      return {
        businessId: b.id,
        name: b.name,
        businessType: b.businessType,
        currency: b.currency,
        isActive: b.isActive,
        profile: condition.profile,
        ownerDecision: resolved.home.currentOwnerDecision,
        // Canonical stale-evidence domains of that same decision (internal context for investment eligibility).
        staleDomains: resolved.staleDomains ?? undefined,
        survivalEvidence: resolved.survivalEvidence ?? undefined,
      };
    })
  );

  return buildPortfolioView(inputs, { now: opts.now });
}
