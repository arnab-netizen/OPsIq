/**
 * Cockpit ↔ domain-diagnosis priority bridge (beta integrity BIV-03).
 *
 * `/owner/cockpit` Home only read the governed execution bridge and the Finance diagnosis
 * (cockpit-finance-priority.service.ts). Sales, Strategy, Operations, SOP, Marketing, Cashflow and
 * Recovery diagnoses never reached it, so an owner with an open high-priority Sales action or a
 * RISKY strategy verdict was told "No urgent action needs your attention".
 *
 * This read-only bridge reuses the EXISTING cross-domain owner-home aggregation (`getOwnerHome`:
 * business resolution, ownership guard, latest-cycle open actions, spine ranking) and returns its
 * highest-ranked open non-Finance action (Finance keeps its own card). Business scoping is inherited
 * from `getOwnerHome`: an explicit, owned `businessId` is honored; with none it resolves only when
 * the workspace has exactly one business, otherwise it returns null (fail closed, never guesses).
 */
import { getOwnerHome } from "@/services/owner-home/home.service";

export interface CockpitDomainPriority {
  businessId: string;
  domain: string;
  /** Owner-facing module name, e.g. "Sales". */
  domainLabel: string;
  title: string;
  status: string;
  priorityScore: number;
  /** Module page where the action is worked. */
  href: string;
}

const DOMAIN_ROUTE: Record<string, { label: string; href: string }> = {
  sales: { label: "Sales", href: "/owner/sales" },
  strategy: { label: "Strategy", href: "/owner/strategy" },
  operations: { label: "Operations", href: "/owner/operations" },
  sop: { label: "Execution", href: "/owner/execution" },
  marketing: { label: "Marketing", href: "/owner/marketing" },
  cashflow: { label: "Cash flow", href: "/owner/cashflow" },
  recovery: { label: "Recovery", href: "/owner/recovery" },
};

export async function getCockpitDomainPriority(
  workspaceId: string,
  businessId: string | null | undefined,
  deps: { getOwnerHome: typeof getOwnerHome } = { getOwnerHome }
): Promise<CockpitDomainPriority | null> {
  const home = await deps.getOwnerHome(workspaceId, businessId ?? null);
  if (!home.selectedBusinessId || !home.summary) return null;
  const top = home.summary.requiredActions.find((a) => a.domain in DOMAIN_ROUTE);
  if (!top) return null;
  const route = DOMAIN_ROUTE[top.domain];
  return {
    businessId: home.selectedBusinessId,
    domain: top.domain,
    domainLabel: route.label,
    title: top.title,
    status: top.status,
    priorityScore: top.priorityScore,
    href: route.href,
  };
}
