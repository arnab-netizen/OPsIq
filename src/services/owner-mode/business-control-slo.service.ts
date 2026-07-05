/**
 * Business-Control SLO service (owner-callable).
 *
 * Thin wrapper: the SLOs are computed inside the live Owner Now View (from the same signals
 * it already produces), so the owner-callable entry point runs the now-view and returns its
 * business-control health. No separate data path, no orphan monitoring module.
 */

import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import type { BusinessControlHealth } from "@/domain/owner-mode/business-control-slo";

export async function getBusinessControlHealth(
  workspaceId: string,
  businessId: string | null = null
): Promise<BusinessControlHealth> {
  const view = await getOwnerNowView(workspaceId, businessId);
  return view.businessControlHealth;
}
